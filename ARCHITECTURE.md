# Architecture — Chris Grau Plugin Platform

Deep dive into system design, data flow, database schema, job lifecycle, and the build pipeline.

---

## System Overview

The platform has four distinct runtime layers:

1. **Browser** — Next.js 14 frontend (chat, preview, download)
2. **API Server** — Fastify 4 (request handling, AI calls, WebSocket)
3. **Worker** — BullMQ consumer (async job runner, GitHub poller)
4. **Build Runner** — GitHub Actions (`macos-latest`) — the only layer that can actually compile JUCE

The API and Worker run in the same Node.js process by default (controlled by `START_WORKER=false` to split them).

---

## Data Flow

```
Browser
  │
  │  1. POST /api/plugins/generate  {"description": "warm reverb..."}
  ▼
Fastify API
  │
  │  2. Call Claude 3.5 Sonnet with structured prompt
  ▼
Anthropic API
  │
  │  3. Return DspSpec JSON
  ▼
Fastify API
  │  4. Persist Plugin record (status: PENDING)
  │  5. Return { pluginId, dspSpec } to browser
  │
  │  6. POST /api/plugins/:id/compile
  ▼
Fastify API
  │  7. Create CompilationJob record (status: QUEUED)
  │  8. Enqueue BullMQ job { pluginId, compilationJobId }
  │  9. Return 202 Accepted
  │
  ▼
BullMQ Queue (Redis)
  │
  │  10. Worker dequeues job
  ▼
BullMQ Worker
  │  11. Update CompilationJob → RUNNING
  │  12. POST GitHub workflow_dispatch with inputs
  │
  ▼
GitHub API
  │  13. Trigger compile-plugin.yml on macos-latest runner
  │
  ▼
GitHub Actions Runner
  │  (see Build Pipeline section below)
  │
  ▼
BullMQ Worker (polling)
  │  14. GET /repos/.../actions/runs?workflow_id=... every 15s
  │  15. On completed: GET artifact URLs
  │  16. Update Plugin (auUrl, vst3Url, pkgUrl)
  │  17. Update CompilationJob → COMPLETED
  │
  ▼
Fastify WebSocket (/ws/plugins/:id/status)
  │  18. Polls DB every 5s, pushes status to browser
  │
  ▼
Browser
  19. Download buttons appear
```

---

## Database Schema

Five Prisma models backed by Supabase PostgreSQL 16.

```
┌─────────────────────────────────────────────────────────────────┐
│  User                                                           │
│  ─────────────────────────────────────────────────────────────  │
│  id              String  @id @default(cuid())                   │
│  email           String  @unique                                │
│  name            String?                                        │
│  tier            Tier    FREE | PRO | CREATOR                   │
│  buildsThisMonth Int     @default(0)                            │
│  stripeCustomerId String?                                       │
│  createdAt       DateTime                                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │ 1:many
┌──────────────────────────────▼──────────────────────────────────┐
│  Plugin                                                         │
│  ─────────────────────────────────────────────────────────────  │
│  id          String  @id @default(cuid())                       │
│  userId      String  → User.id                                  │
│  name        String                                             │
│  description String?                                            │
│  mode        Int     1 (describe) | 2 (reference) | 3 (live)   │
│  dspSpec     Json    — full DspSpec from Claude                 │
│  guiSpec     Json?   — future GUI customization                 │
│  status      PluginStatus  PENDING|COMPILING|READY|FAILED       │
│  auUrl       String?  — GitHub artifact download URL            │
│  vst3Url     String?                                            │
│  pkgUrl      String?                                            │
│  version     String  @default("1.0.0")                         │
│  createdAt   DateTime                                           │
│  updatedAt   DateTime @updatedAt                                │
└──────────┬───────────────────────────┬───────────────────────────┘
           │ 1:many                    │ 1:many
┌──────────▼──────────┐   ┌───────────▼────────────────────────────┐
│  CompilationJob     │   │  Preset                                │
│  ─────────────────  │   │  ──────────────────────────────────    │
│  id           cuid  │   │  id         cuid                       │
│  pluginId     →     │   │  pluginId   → Plugin.id                │
│  status       enum  │   │  userId     → User.id                  │
│    QUEUED           │   │  name       String                     │
│    RUNNING          │   │  parameters Json  — saved knob values  │
│    COMPLETED        │   │  isPublic   Boolean                    │
│    FAILED           │   └────────────────────────────────────────┘
│  runnerId     String?    │
│  startedAt    DateTime?  │
│  completedAt  DateTime?  │
│  auvalResult  String?    │   ┌────────────────────────────────────┐
│  pluginvalResult String? │   │  MarketplaceListing                │
│  errorLog     String?    │   │  ──────────────────────────────    │
│  retryCount   Int @def 0 │   │  id       cuid                    │
└─────────────────────────┘   │  pluginId → Plugin.id             │
                               │  userId   → User.id               │
                               │  price    Decimal                  │
                               │  sales    Int @default(0)          │
                               │  rating   Float?                   │
                               └────────────────────────────────────┘
```

**Tier limits (enforced in routes/plugins.ts):**

| Tier | Builds/month |
|---|---|
| FREE | 3 |
| PRO | unlimited |
| CREATOR | unlimited |

---

## BullMQ Job Lifecycle

```
POST /api/plugins/:id/compile
          │
          │ queue.add('compile-plugin', { pluginId, compilationJobId })
          ▼
     ┌──────────────┐
     │    QUEUED    │  CompilationJob created, BullMQ job enqueued
     └──────┬───────┘
            │ worker picks up (concurrency: 5)
            ▼
     ┌──────────────┐
     │   RUNNING    │  DB updated, GitHub workflow_dispatch fired
     └──────┬───────┘
            │
      ┌─────┴──────┐
      │            │
   success       failure
      │            │
      ▼            ▼
┌──────────┐  ┌──────────┐
│COMPLETED │  │  FAILED  │  retryCount < 3 → exponential backoff retry
│ auUrl    │  │errorLog  │  retryCount = 3 → terminal failure
│ vst3Url  │  └──────────┘
│ pkgUrl   │
└──────────┘

Polling interval: 15 seconds
Timeout: 20 minutes (then → FAILED)
Max retries: 3 (with exponential backoff)
Concurrency: 5 simultaneous jobs
```

---

## GitHub Actions Build Pipeline

### `compile-plugin.yml` — 12 Steps

**Trigger:** `workflow_dispatch` with inputs `template_name`, `plugin_name`, `dsp_spec_json`

**Runner:** `macos-latest`

```
Step 1: Checkout
  └─ git checkout with full history

Step 2: Cache CMake / JUCE
  └─ Cache key: os + cmake version + JUCE commit hash
  └─ Saves ~5 min on warm cache hits

Step 3: Install dependencies
  └─ brew install cmake ninja
  └─ Required for FetchContent JUCE build

Step 4: inject_spec.py
  └─ Input:  ${{ inputs.dsp_spec_json }}
  └─ Output: templates/{template}/Source/generated_config.h
  └─ Generates: CHIBI_PLUGIN_NAME, PARAM_ID_*, PARAM_DEFAULT_*,
                PARAM_MIN_*, PARAM_MAX_*, createParameterLayout()

Step 5: CMake configure
  └─ cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
  └─ FetchContent pulls JUCE 7.0.12

Step 6: CMake build
  └─ cmake --build build --config Release --parallel
  └─ Targets: AU, VST3, Standalone

Step 7: Locate bundles
  └─ find build/ -name "*.component" -o -name "*.vst3"
  └─ Sets output paths for codesign + packaging

Step 8: Codesign
  └─ Requires: APPLE_CERTIFICATE_BASE64, APPLE_TEAM_ID
  └─ codesign --force --deep --sign "$APPLE_TEAM_ID"
  └─ Skips gracefully if secrets absent

Step 9: Validate
  └─ scripts/validate_plugin.sh
  └─ auval -v aufx Revb Chib   (AU validation)
  └─ pluginval --strictness-level 5   (cross-platform check)
  └─ Outputs PASS/FAIL/SKIP summary

Step 10: Package
  └─ scripts/package_plugin.sh
  └─ Stages AU → ~/Library/Audio/Plug-Ins/Components
  └─ Stages VST3 → ~/Library/Audio/Plug-Ins/VST3
  └─ pkgbuild (component packages)
  └─ productbuild (distribution package)
  └─ Optional signing with PKG_SIGNING_IDENTITY
  └─ Output: {PluginName}-{Version}-installer.pkg

Step 11: Upload artifact
  └─ actions/upload-artifact
  └─ Includes: .component, .vst3, .pkg
  └─ Retention: 30 days

Step 12: Notify on failure
  └─ If BUILD_WEBHOOK_URL set: POST failure payload
  └─ Payload: { run_id, workflow, repo, conclusion, url }
```

---

## AI / DspSpec Generation

### Three Build Modes

| Mode | Name | Description |
|---|---|---|
| 1 | Describe It | Natural language → Claude → DspSpec → JUCE template |
| 2 | Upload Reference | Coming soon — analyze a reference plugin's character |
| 3 | Play Live | Coming soon — live audio input for interactive DSP shaping |

### Mode 1 Flow (active)

```
User input: "warm plate reverb, pre-delay, room size, mix"
      │
      ▼
Claude 3.5 Sonnet
  System prompt: strict DspSpec JSON schema
  User message:  natural language description
      │
      ▼
DspSpec JSON:
{
  "type": "effect",
  "algorithm": "plate_reverb",
  "templateId": "reverb-plate-v1",
  "parameters": [
    {
      "id": "roomSize",
      "label": "Room Size",
      "min": 0, "max": 1, "default": 0.6,
      "unit": "",
      "taper": "linear"
    },
    {
      "id": "preDelay",
      "label": "Pre-Delay",
      "min": 0, "max": 100, "default": 20,
      "unit": "ms",
      "taper": "linear"
    },
    {
      "id": "mix",
      "label": "Dry/Wet",
      "min": 0, "max": 1, "default": 0.3,
      "unit": "",
      "taper": "linear"
    }
  ],
  "signalFlow": ["input", "preDelay", "plateReverb", "dryWetMix", "output"]
}
      │
      ▼
inject_spec.py generates Source/generated_config.h:
  #define CHIBI_PLUGIN_NAME    "My Reverb"
  #define PARAM_ID_ROOMSIZE    "roomSize"
  #define PARAM_DEFAULT_ROOMSIZE  0.6f
  #define PARAM_MIN_ROOMSIZE      0.0f
  #define PARAM_MAX_ROOMSIZE      1.0f
  // ... and inline createParameterLayout() for JUCE APVTS
```

### Template Mapping

The AI service maps algorithm names to existing templates:

| Algorithm | Template |
|---|---|
| plate_reverb, room_reverb | `reverb-plate-v1` |
| lowpass, highpass, bandpass | *(planned)* |
| compressor, limiter | *(planned)* |
| delay, echo | *(planned)* |
| distortion, saturation | *(planned)* |

---

## Real-time Communication

### WebSocket (`/ws/plugins/:id/status`)

- Opened by the frontend Plugin Studio after triggering a build
- Server polls Prisma for `CompilationJob.status` every 5 seconds
- Pushes `{ status, auUrl, vst3Url, pkgUrl, errorLog }` on each poll
- Closed by client on `COMPLETED` or `FAILED`

### Server-Sent Events (`/api/chat/stream`)

- Used for streaming Claude response tokens to the chat panel
- Three event types:
  - `token` — partial text chunk
  - `dspSpec` — final DspSpec JSON (triggers Build button enable)
  - `done` — stream closed
- Frontend falls back to mock response if SSE unavailable (dev mode)

---

## Security Model

- All credentials in environment variables — no hardcoded secrets
- Supabase RLS policies are active — do not drop or alter without explicit instruction
- `GITHUB_TOKEN` scoped to `repo` + `workflow` only
- FREE tier enforced server-side (3 builds/month via `User.buildsThisMonth`)
- CORS restricted to `CORS_ORIGIN` (single origin, not wildcard in production)

---

## Future: Auth, Stripe, Marketplace

### Authentication (Sprint 2)

- Auth.js session middleware on Fastify
- Supabase Auth as provider
- `userId` currently auto-creates `dev@chibitek.local` for dev — will be replaced by real session

### Stripe (Sprint 3)

- `User.stripeCustomerId` column already in schema
- Webhook handler: `POST /api/billing/webhook`
- On successful payment: upgrade `User.tier`
- `MarketplaceListing.price` ready for paid plugin sales

### Marketplace (Sprint 3)

- `MarketplaceListing` table already in schema
- `Preset` table supports public sharing
- UI: browse, preview (Web Audio), purchase, install
