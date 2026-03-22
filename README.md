# Chris Grau Plugin Platform

An AI-powered audio plugin factory. Describe a plugin in plain English, get back a signed, installable AU/VST3/PKG for macOS.

Built for Chris Grau. Powered by Claude, JUCE, and GitHub Actions.

---

## What This Is

You type: *"A warm plate reverb with pre-delay and a dry/wet mix knob"*

The platform:
1. Sends your description to Claude (3.5 Sonnet), which returns a structured DSP spec (parameters, algorithm, signal flow)
2. Enqueues a compilation job via BullMQ
3. Triggers a GitHub Actions workflow that injects the spec into a JUCE template, compiles AU + VST3 + Standalone, validates with auval + pluginval, and packages a macOS `.pkg` installer
4. Polls for completion and surfaces download URLs in the UI

Zero DSP knowledge required.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js 14)                         │
│                                                                     │
│   ┌──────────────────┐                ┌──────────────────────────┐  │
│   │    Chat Panel    │◄── SSE tokens  │     Plugin Studio        │  │
│   │  (AI chat UI)    │                │  (preview, build, DL)    │  │
│   └──────────────────┘                └──────────────────────────┘  │
└──────────────┬──────────────────────────────────┬───────────────────┘
               │ HTTP / WebSocket                 │ HTTP
               ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Fastify API  (port 3001)                        │
│                                                                      │
│   POST /api/plugins/generate    ──►  AI Service (Claude 3.5 Sonnet) │
│   POST /api/plugins/:id/compile ──►  BullMQ Queue                   │
│   GET  /api/plugins/:id/status                                       │
│   GET  /api/plugins                                                  │
│   WS   /ws/plugins/:id/status                                        │
└──────────┬────────────────────────────────┬─────────────────────────┘
           │ Prisma ORM                     │ BullMQ / ioredis
           ▼                                ▼
┌──────────────────────┐      ┌──────────────────────────────────────┐
│   Supabase           │      │   Redis 7   (job queue + state)      │
│   PostgreSQL 16      │      └───────────────────┬──────────────────┘
│   (5 tables)         │                          │ worker dequeues
└──────────────────────┘                          ▼
                                   ┌──────────────────────────────────┐
                                   │        BullMQ Worker             │
                                   │        (concurrency: 5)          │
                                   │                                  │
                                   │  1. DB → status RUNNING          │
                                   │  2. POST workflow_dispatch       │
                                   │  3. Poll GitHub API every 15s    │
                                   │  4. Fetch artifact URLs          │
                                   │  5. DB → status READY            │
                                   └───────────────┬──────────────────┘
                                                   │ GitHub API
                                                   ▼
                                   ┌──────────────────────────────────┐
                                   │  GitHub Actions  (macos-latest)  │
                                   │                                  │
                                   │   1.  Checkout                   │
                                   │   2.  Cache CMake / JUCE         │
                                   │   3.  Install cmake + ninja      │
                                   │   4.  inject_spec.py             │
                                   │   5.  cmake configure            │
                                   │   6.  cmake build (Release)      │
                                   │   7.  Locate .component + .vst3  │
                                   │   8.  Codesign (optional)        │
                                   │   9.  auval + pluginval          │
                                   │  10.  package_plugin.sh → .pkg   │
                                   │  11.  Upload artifact (30 days)  │
                                   │  12.  Notify on failure          │
                                   └──────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 14, React 18, Tailwind CSS | Plugin builder UI, streaming chat |
| Real-time | Server-Sent Events, Socket.IO | Chat token streaming, build status |
| Audio preview | Tone.js 15 | In-browser Web Audio preview |
| Backend | Fastify 4, TypeScript | REST API + WebSocket server |
| AI | Claude 3.5 Sonnet (`@anthropic-ai/sdk`) | Natural language → DspSpec JSON |
| Job queue | BullMQ 5, ioredis | Async compilation, retry logic |
| Database | PostgreSQL 16 via Supabase, Prisma 5 | Plugin and job persistence |
| Build | GitHub Actions (`macos-latest`) | JUCE compilation, signing, packaging |
| Audio SDK | JUCE 7.0.12 (FetchContent) | AU, VST3, Standalone targets |
| Validation | auval, pluginval 1.0.3 | Plugin format verification |
| Scripts | Python 3, Bash | Spec injection, .pkg creation |
| Containers | Docker Compose | Local Postgres + Redis |
| Future | Cloudflare R2 | Artifact storage |
| Future | Stripe | Billing and subscriptions |

---

## End-to-End Flow

```
"warm plate reverb, pre-delay 0–100ms, room size, dry/wet mix"
      │
      ▼
POST /api/plugins/generate
  └─► Claude 3.5 Sonnet → DspSpec JSON:
      {
        "type": "effect",
        "algorithm": "plate_reverb",
        "templateId": "reverb-plate-v1",
        "parameters": [
          { "id": "roomSize", "min": 0, "max": 1,   "default": 0.6 },
          { "id": "preDelay", "min": 0, "max": 100, "default": 20, "unit": "ms" },
          { "id": "mix",      "min": 0, "max": 1,   "default": 0.3 }
        ]
      }
      │
      ▼
POST /api/plugins/:id/compile
  └─► BullMQ enqueues { pluginId, compilationJobId }
      │
      ▼
Worker: POST /repos/.../actions/workflows/compile-plugin.yml/dispatches
  inputs: { template_name, plugin_name, dsp_spec_json }
      │
      ▼
GitHub Actions (macos-latest)
  ├─ inject_spec.py → Source/generated_config.h  (parameter macros)
  ├─ cmake build → MyPlugin.component (AU) + MyPlugin.vst3
  ├─ codesign (if APPLE_CERTIFICATE_BASE64 set)
  ├─ auval + pluginval (strictness 5)
  ├─ pkgbuild + productbuild → MyPlugin-1.0.0-installer.pkg
  └─ Upload artifact (30-day retention)
      │
      ▼
Worker polls every 15s → on success fetches artifact URLs
  └─► DB: Plugin.auUrl, Plugin.vst3Url, Plugin.pkgUrl set
      DB: CompilationJob.status → COMPLETED
      │
      ▼
Frontend WebSocket receives update → download buttons appear
```

---

## Repo Structure

```
chris-grau-plugin-platform/
│
├── .github/
│   └── workflows/
│       ├── compile-plugin.yml      # Main build pipeline (12 steps, macos-latest)
│       └── validate-template.yml  # PR gate — validates template changes before merge
│
├── backend/                        # Fastify API + BullMQ worker
│   ├── src/
│   │   ├── index.ts                # Server entry — registers routes, starts worker
│   │   ├── routes/plugins.ts       # All plugin API endpoints
│   │   ├── services/ai.ts          # Claude integration → DspSpec
│   │   └── jobs/compile.ts         # Worker — triggers + polls GitHub Actions
│   ├── prisma/
│   │   ├── schema.prisma           # 5-table schema
│   │   └── migrations/             # Applied SQL migrations
│   ├── .env.example
│   └── package.json
│
├── frontend/                       # Next.js 14 app
│   ├── app/
│   │   ├── page.tsx                # Landing page — mode selector
│   │   ├── layout.tsx              # Root layout
│   │   └── studio/page.tsx         # Plugin builder — chat + preview
│   ├── components/
│   │   ├── chat/ChatPanel.tsx      # Streaming AI chat
│   │   └── preview/
│   │       ├── PluginPreview.tsx   # Build status + download links
│   │       └── WebAudioPreview.tsx # In-browser audio preview (Tone.js)
│   ├── lib/
│   │   ├── api.ts                  # API client + Zod schemas
│   │   └── utils.ts
│   └── package.json
│
├── templates/                      # JUCE plugin templates
│   └── reverb-plate-v1/
│       ├── CMakeLists.txt          # JUCE 7 FetchContent build
│       ├── dsp_spec.json           # Canonical parameter spec
│       └── Source/
│           ├── PluginProcessor.{h,cpp}   # Plate reverb DSP
│           └── PluginEditor.{h,cpp}      # Rotary knob GUI
│
├── scripts/
│   ├── inject_spec.py              # DspSpec JSON → generated_config.h
│   ├── validate_plugin.sh          # auval + pluginval validation
│   └── package_plugin.sh           # macOS .pkg installer creation
│
├── supabase/                       # Supabase project metadata
├── docker-compose.yml              # Local Postgres 16 + Redis 7 + dev tools
├── BUILD_STATUS.md                 # Sprint status and open todos
├── ARCHITECTURE.md                 # Deep dive into system design
└── SPRINT_LOG.md                   # Sprint history and roadmap
```

---

## Local Dev Setup

### Prerequisites

- Node.js 20+
- Docker Desktop
- Python 3.10+
- macOS (required for JUCE compilation and auval validation)

### 1. Clone

```bash
git clone https://github.com/erickgrau/chris-grau-plugin-platform.git
cd chris-grau-plugin-platform
```

### 2. Start infrastructure

```bash
# Postgres + Redis
docker compose up -d

# Add pgAdmin (localhost:5050) and Redis Commander (localhost:8081)
docker compose --profile dev up -d
```

### 3. Configure and start backend

```bash
cd backend
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and GITHUB_TOKEN at minimum
npm install
npm run prisma:migrate
npm run dev
# → listening on http://localhost:3001
```

### 4. Configure and start frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
# → http://localhost:3000
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Supabase pooler or local) |
| `REDIS_HOST` | Yes | Redis host (default: `localhost`) |
| `REDIS_PORT` | Yes | Redis port (default: `6379`) |
| `REDIS_PASSWORD` | No | Redis auth (docker-compose default: `chibitek_local`) |
| `GITHUB_TOKEN` | Yes | GitHub PAT with `repo` + `workflow` scopes |
| `GITHUB_OWNER` | Yes | GitHub org/user (default: `erickgrau`) |
| `GITHUB_REPO` | Yes | Repo name (default: `chris-grau-plugin-platform`) |
| `GITHUB_WORKFLOW_ID` | Yes | Workflow file (default: `compile-plugin.yml`) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key (`sk-ant-...`) |
| `CORS_ORIGIN` | Yes | Frontend URL (default: `http://localhost:3000`) |
| `R2_PUBLIC_URL` | No | Cloudflare R2 base URL (future artifact storage) |
| `NODE_ENV` | No | `development` or `production` |
| `START_WORKER` | No | Set `false` to run API without the BullMQ worker |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Yes | Backend API URL (default: `http://localhost:3001`) |
| `NEXT_PUBLIC_WS_URL` | Yes | WebSocket URL (default: `http://localhost:3001`) |

### GitHub Actions Secrets

| Secret | Required | Description |
|---|---|---|
| `APPLE_CERTIFICATE_BASE64` | No | Base64-encoded `.p12` developer certificate |
| `APPLE_CERTIFICATE_PASSWORD` | No | Password for the `.p12` |
| `APPLE_TEAM_ID` | No | Apple Developer Team ID |
| `PKG_SIGNING_IDENTITY` | No | Installer signing identity string |
| `BUILD_WEBHOOK_URL` | No | URL to POST on build failure |

All codesigning secrets are optional. Without them the build succeeds — plugins are just unsigned.

---

## Triggering a Build

### Via the UI

1. Open `http://localhost:3000`
2. Click **Describe It** (Mode 1)
3. Type a plugin description in the chat panel
4. When the DspSpec appears, click **Build Plugin**
5. Watch real-time status in the preview panel
6. Download AU, VST3, or PKG when complete

### Via the API

```bash
# Step 1: generate DspSpec
curl -X POST http://localhost:3001/api/plugins/generate \
  -H "Content-Type: application/json" \
  -d '{"description": "warm plate reverb with pre-delay and mix", "mode": 1}'

# Step 2: compile
curl -X POST http://localhost:3001/api/plugins/{pluginId}/compile \
  -H "Content-Type: application/json" \
  -d '{}'

# Step 3: poll status
curl http://localhost:3001/api/plugins/{pluginId}/status
```

### Via GitHub CLI (manual)

```bash
gh workflow run compile-plugin.yml \
  --field template_name=reverb-plate-v1 \
  --field plugin_name="My Reverb" \
  --field dsp_spec_json='{"type":"effect","parameters":[...]}'
```

---

## GitHub Actions Workflows

### `compile-plugin.yml` — Main Build Pipeline

Triggered by `workflow_dispatch`. Runs on `macos-latest`.

**Inputs:** `template_name`, `plugin_name`, `dsp_spec_json`

**Steps:**
1. Checkout repo
2. Restore CMake/JUCE build cache
3. Install `cmake` + `ninja` via Homebrew
4. `inject_spec.py` — writes `Source/generated_config.h` with parameter macros
5. `cmake` configure (Release, FetchContent JUCE)
6. `cmake` build (Release, parallel jobs)
7. Locate `.component` + `.vst3` bundles
8. Codesign (skips gracefully if secrets absent)
9. `validate_plugin.sh` — auval + pluginval at strictness level 5
10. `package_plugin.sh` — pkgbuild + productbuild → `.pkg`
11. Upload all artifacts (30-day retention)
12. POST `BUILD_WEBHOOK_URL` on failure (if set)

### `validate-template.yml` — PR Gate

Triggered on PRs touching `templates/**`, `scripts/**`, `.github/workflows/**`.

Runs `inject_spec.py` dry-run and `cmake` configure check — no full build. PRs fail if template files are missing or the spec injection breaks.

---

## Contributing

### Adding a template

1. Create `templates/your-template-name/` modeled on `reverb-plate-v1`
2. Required: `CMakeLists.txt`, `dsp_spec.json`, `Source/PluginProcessor.{h,cpp}`, `Source/PluginEditor.{h,cpp}`
3. Your `CMakeLists.txt` must `#include "generated_config.h"` — that's what `inject_spec.py` writes
4. Open a PR — `validate-template.yml` runs automatically
5. Once merged, register your `templateId` in `backend/src/services/ai.ts`

### Backend

- Routes in `backend/src/routes/plugins.ts` — validate with Zod, write via Prisma, no raw SQL
- New job types get a dedicated file in `backend/src/jobs/`

### Frontend

- Pages: `frontend/app/` (Next.js 14 App Router)
- Shared components: `frontend/components/`
- API types are Zod schemas in `frontend/lib/api.ts` — keep in sync with backend

### Hard rules

- No mock/seed data — the platform syncs with real systems only
- No hardcoded credentials — everything in environment variables
- No RLS changes on Supabase without explicit instruction
