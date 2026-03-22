# Chibitek Plugin Platform — Build Status

## DSP: reverb-plate-v1

**Status:** ✅ Template Created — Ready for CMake build  
**Date:** 2026-03-22  
**Engineer:** plugin-dsp-agent

### Files Created

| File | Purpose |
|------|---------|
| `templates/reverb-plate-v1/CMakeLists.txt` | JUCE CMake build — AU + VST3 + Standalone targets |
| `templates/reverb-plate-v1/Source/PluginProcessor.h` | AudioProcessor class declaration |
| `templates/reverb-plate-v1/Source/PluginProcessor.cpp` | DSP implementation: pre-delay + plate reverb |
| `templates/reverb-plate-v1/Source/PluginEditor.h` | GUI class declaration |
| `templates/reverb-plate-v1/Source/PluginEditor.cpp` | Placeholder knob UI (4 rotary controls) |
| `templates/reverb-plate-v1/dsp_spec.json` | Canonical AI-injectable parameter schema |

### Parameters

| ID | Range | Default | Unit |
|----|-------|---------|------|
| `roomSize` | 0–1 | 0.6 | — |
| `damping` | 0–1 | 0.4 | — |
| `mix` | 0–1 | 0.3 | — |
| `preDelay` | 0–100 | 20 | ms |

### DSP Chain

1. **Pre-Delay** — `juce::dsp::DelayLine<float, LinearInterpolation>` (stereo, one line per channel)
2. **Plate Reverb** — `juce::dsp::Reverb` (Freeverb-based plate model, stereo)

### Build Instructions

```bash
cd templates/reverb-plate-v1
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

> JUCE 7.0.12 is fetched automatically via FetchContent on first configure.  
> Requires Xcode command-line tools (AU/VST3 on macOS) or a VST3 SDK path on other platforms.

### Known Caveats / TODOs

- `juce::dsp::Reverb` is a Freeverb-derived algorithm; it produces a reasonable "plate-like" character but is not a true physical plate simulation. A dedicated Dattorro plate algorithm can replace stage 2 later.
- Pre-delay uses `DelayLine::popSample` with `updateReadPointer=true` which auto-advances the read head; push/pop order is intentional (delayed output before new input push).
- GUI is placeholder only — no custom look-and-feel, no WebView. Ready for UI layer injection.
- No AU validation (auval) run yet; that requires a full macOS Xcode build.

## INFRA: Pipeline Setup

**Status:** ✅ Complete  
**Date:** 2026-03-22  
**Agent:** plugin-infra-agent

### Files Created

| File | Description |
|------|-------------|
| `.github/workflows/compile-plugin.yml` | Main build pipeline — workflow_dispatch triggered, 12-step: checkout→inject→cmake→build→codesign→validate→package→upload. Failure webhook on `BUILD_WEBHOOK_URL` secret. |
| `.github/workflows/validate-template.yml` | PR gate — detects changed templates, validates CMakeLists.txt presence, dry-runs inject_spec.py, cmake configure check. |
| `scripts/inject_spec.py` | DspSpec JSON → `Source/generated_config.h`. Emits plugin metadata macros, PARAM_ID_*/PARAM_DEFAULT_*/PARAM_MIN_*/PARAM_MAX_* macros, and a `createParameterLayout()` JUCE APVTS helper. Supports `--dry-run` for validation-only mode. |
| `scripts/validate_plugin.sh` | Installs pluginval (v1.0.3), runs `auval` on .component, runs `pluginval` on both AU + VST3. Detailed pass/fail/skip summary. Exits non-zero on any failure. |
| `scripts/package_plugin.sh` | Stages AU + VST3 bundles, calls `pkgbuild` per format, creates distribution XML, calls `productbuild` for final `.pkg`. Optionally signs with `PKG_SIGNING_IDENTITY`. |
| `docker-compose.yml` | Postgres 16 (port 5432) + Redis 7 (port 6379). Dev-tools profile adds pgAdmin (5050) + Redis Commander (8081). Named volumes for data persistence. |
| `README.md` | Full repo docs: structure, build trigger (UI/CLI/API), DspSpec format, pipeline steps, secrets table, local dev guide, scripts reference. |
| `backend/` | Placeholder directory for backend agent |
| `frontend/` | Placeholder directory for frontend agent |
| `templates/` | Placeholder directory for DSP agent templates |

### Key Design Decisions

- **Codesign is non-blocking**: if `APPLE_CERTIFICATE_BASE64` secret is absent, pipeline skips signing and continues (useful for CI before Apple enrollment)
- **Webhook on failure**: backend can subscribe to `BUILD_WEBHOOK_URL` to update job status in Postgres
- **pluginval strictness** configurable via `PLUGINVAL_STRICTNESS` env var (default 5, max 10)
- **CMake FetchContent** pulls JUCE at configure time — no submodule dependency
- **inject_spec.py** generates a JUCE APVTS `createParameterLayout()` inline function so templates just call it — minimal template coupling

---

## BACKEND: API Scaffold

**Status:** ✅ Complete — Runnable Fastify + Prisma + BullMQ scaffold  
**Date:** 2026-03-22  
**Engineer:** plugin-backend-agent

### Files Created

| File | Purpose |
|------|---------|
| `backend/package.json` | Node.js dependencies (Fastify, BullMQ, Prisma, Stripe, R2, Claude SDK) |
| `backend/tsconfig.json` | TypeScript config targeting ES2022/CommonJS |
| `backend/.env.example` | All required env vars with documentation |
| `backend/prisma/schema.prisma` | Full PostgreSQL schema (5 models, enums) |
| `backend/src/index.ts` | Fastify server entry: routes, WebSocket, BullMQ worker, graceful shutdown |
| `backend/src/routes/plugins.ts` | Plugin API routes (generate, compile, status, list) |
| `backend/src/jobs/compile.ts` | BullMQ worker: GitHub Actions workflow_dispatch + polling |
| `backend/src/services/ai.ts` | Claude API integration with DspSpec JSON validation via Zod |

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health check |
| `POST` | `/api/plugins/generate` | AI-generate DspSpec from natural language |
| `POST` | `/api/plugins/:id/compile` | Enqueue compilation job → returns jobId |
| `GET` | `/api/plugins/:id/status` | Plugin status + download URLs |
| `GET` | `/api/plugins` | List user's plugins |
| `WS` | `/ws/plugins/:id/status` | Real-time compilation status updates |

### Database Models (PostgreSQL via Prisma)

- **User** — id, email, name, tier (FREE/PRO/CREATOR), buildsThisMonth, stripeCustomerId
- **Plugin** — id, userId, name, description, mode (1/2/3), dspSpec JSON, guiSpec JSON, status (PENDING/COMPILING/READY/FAILED), auUrl, vst3Url, pkgUrl, version
- **CompilationJob** — id, pluginId, status (QUEUED/RUNNING/COMPLETED/FAILED), runnerId, startedAt, completedAt, auvalResult, pluginvalResult, errorLog, retryCount
- **Preset** — id, pluginId, userId, name, parameters JSON, isPublic
- **MarketplaceListing** — id, pluginId, userId, price, sales, rating

### DspSpec Schema

```json
{
  "type": "filter | compressor | reverb | delay | distortion | eq | synth | utility | custom",
  "algorithm": "biquad-lowpass",
  "parameters": {
    "cutoffFrequency": { "default": 1000, "min": 20, "max": 20000, "label": "Cutoff", "unit": "Hz" }
  },
  "signalFlow": ["input", "filter", "output"],
  "templateId": "tpl-filter-lowpass-v1"
}
```

### Compilation Flow

1. `POST /api/plugins/:id/compile` → creates `CompilationJob` record → enqueues BullMQ job
2. Worker triggers `workflow_dispatch` on `GITHUB_OWNER/GITHUB_REPO` via GitHub API
3. Polls run status every 15s (max 20 min timeout)
4. On success: fetches artifact URLs → updates Plugin record (READY + download URLs)
5. On failure: marks Plugin FAILED, writes errorLog, auto-retries 3× with exponential backoff

### Quick Start

```bash
cd backend
cp .env.example .env
# Fill in .env values

npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

### TODOs / Next Steps

- [ ] Wire in Auth.js session middleware (replace dev userId fallback)
- [ ] Add Stripe webhook handler for tier upgrades
- [ ] Add R2 upload endpoint for compiled artifacts (triggered from GitHub runner)
- [ ] Add `pino-pretty` as dev dep for pretty logging
- [ ] Add rate limiting (`@fastify/rate-limit`)
- [ ] Add `@fastify/cors` to replace manual CORS hook
