# Sprint Log — Chris Grau Plugin Platform

Running record of what was built, what's in progress, and what's next.

---

## Sprint 0 — Scaffold (Completed)

**Status:** Complete
**Completed:** 2026-03-22

### What Was Built

**JUCE Template — `reverb-plate-v1`**
- `PluginProcessor.cpp` — DSP chain: pre-delay (`juce::dsp::DelayLine`) + plate reverb (`juce::dsp::Reverb`)
- `PluginEditor.cpp` — placeholder GUI with 4 rotary knobs (roomSize, damping, mix, preDelay)
- `CMakeLists.txt` — JUCE 7.0.12 via FetchContent, targets AU + VST3 + Standalone
- `dsp_spec.json` — canonical AI-injectable parameter schema
- Bundle ID: `com.chibitek.reverb-plate`, Manufacturer: `Chibitek Labs`

**Build Pipeline**
- `.github/workflows/compile-plugin.yml` — 12-step macOS build (inject → configure → build → sign → validate → package → upload)
- `.github/workflows/validate-template.yml` — PR gate (dry-run inject + cmake syntax check)
- `scripts/inject_spec.py` — DspSpec JSON → `Source/generated_config.h` parameter macros
- `scripts/validate_plugin.sh` — auval + pluginval (strictness 5)
- `scripts/package_plugin.sh` — pkgbuild + productbuild → `.pkg` installer

**Backend API**
- Fastify 4 server on port 3001
- `POST /api/plugins/generate` — Claude 3.5 Sonnet → DspSpec
- `POST /api/plugins/:id/compile` — enqueue BullMQ job
- `GET /api/plugins/:id/status` — poll compilation status
- `GET /api/plugins` — list user plugins
- `WS /ws/plugins/:id/status` — real-time build status
- BullMQ worker (concurrency 5) — triggers and polls GitHub Actions
- Manual CORS, health check endpoint

**Frontend**
- Next.js 14 App Router scaffold
- Landing page — three mode cards (Mode 1 active, 2 and 3 coming soon)
- Plugin Studio (`/studio`) — split layout: ChatPanel (left) + PluginPreview (right)
- `ChatPanel.tsx` — SSE streaming, example prompts, DspSpec detection
- `PluginPreview.tsx` — build status, parameter display, download links
- `WebAudioPreview.tsx` — in-browser Tone.js audio preview
- Tailwind CSS + Radix UI + Framer Motion

**Infrastructure**
- `docker-compose.yml` — Postgres 16 + Redis 7 + pgAdmin + Redis Commander
- Prisma schema: 5 tables (User, Plugin, CompilationJob, Preset, MarketplaceListing)

---

## Sprint 1 — DB Live + AI Wired (In Progress)

**Status:** In progress
**Started:** 2026-03-22

### What Was Done

- Supabase project created and connected (`DATABASE_URL` pointing to pooler endpoint)
- Prisma migration `20260322_init` applied — all 5 tables live in production
- AI service implemented (`backend/src/services/ai.ts`) — Claude 3.5 Sonnet, DspSpec generation in all three modes
- Environment configured: `ANTHROPIC_API_KEY` active, `CORS_ORIGIN` set, Redis connected
- `backend/.env` and `backend/.env.example` complete
- GitHub secrets reference documented

### Remaining in Sprint 1

- [ ] `GITHUB_TOKEN` — fill in PAT with `repo` + `workflow` scopes
- [ ] `R2_PUBLIC_URL` — configure Cloudflare R2 bucket for artifact storage
- [ ] Smoke test end-to-end: generate DspSpec → trigger build → verify GitHub Actions fires
- [ ] Verify `compile-plugin.yml` completes cleanly on macOS runner (no prior test run)

---

## Sprint 2 — Frontend Integration + Auth (Planned)

**Status:** Planned

### Goals

**Frontend ↔ Backend Integration**
- Wire `ChatPanel` SSE to real `POST /api/plugins/generate` (currently uses mock fallback)
- Wire Build button to real `POST /api/plugins/:id/compile`
- Replace mock status polling with real WebSocket (`/ws/plugins/:id/status`)
- Display real download URLs from `Plugin.auUrl`, `Plugin.vst3Url`, `Plugin.pkgUrl`

**Authentication**
- Auth.js session middleware on Fastify
- Supabase Auth provider
- Replace `dev@chibitek.local` auto-user with real session-based `userId`
- Protect all write endpoints — require authenticated user
- Login/logout flow in frontend

**Build Trigger UI**
- Progress indicator during compilation (polling spinner, step labels)
- Error display with `CompilationJob.errorLog` on failure
- History view — list of past plugins with status and re-download links

**Mode 2 — Upload Reference**
- File upload endpoint (`POST /api/plugins/analyze-reference`)
- Claude analyzes reference audio characteristics → DspSpec
- Frontend file picker UI

---

## Sprint 3 — Stripe, Marketplace, Plugin Signing (Planned)

**Status:** Planned

### Goals

**Stripe Billing**
- Stripe webhook handler: `POST /api/billing/webhook`
- On successful subscription: update `User.tier` (FREE → PRO or CREATOR)
- Usage metering — reset `User.buildsThisMonth` on billing cycle
- Pricing page in frontend

**Marketplace**
- Browse page — filter by type, algorithm, rating
- Plugin detail page — Web Audio preview, parameter display, reviews
- Purchase flow (Stripe one-time payment)
- `MarketplaceListing` CRUD endpoints
- Public preset sharing (`Preset.isPublic`)

**Plugin Signing**
- Configure Apple Developer certificate in GitHub secrets
- `PKG_SIGNING_IDENTITY` for installer signing
- Notarization via `xcrun notarytool` (post-build step in workflow)
- Gatekeeper-compatible signed distribution

**Mode 3 — Play Live**
- Live audio input via Web Audio API
- Real-time parameter shaping
- Claude analyzes character from live input → generates DspSpec

---

## Backlog / Future

- Replace Freeverb algorithm in `reverb-plate-v1` with true Dattorro plate simulation
- Custom `LookAndFeel` GUI for JUCE plugins (beyond placeholder knobs)
- WebView support for web-rendered plugin UI
- Additional templates: delay, compressor, limiter, filter bank, saturation
- Cloudflare R2 migration from GitHub artifact URLs (permanent storage)
- pino-pretty logging and request tracing
- Rate limiting on API endpoints
- Plugin versioning (semantic version bump on re-compile)
