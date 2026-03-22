# Frontend — Chris Grau Plugin Platform

Next.js 14 app (App Router). Two pages: a landing page and a plugin builder studio.

---

## Quick Start

```bash
cd frontend
cp .env.local.example .env.local
# Set NEXT_PUBLIC_BACKEND_URL and NEXT_PUBLIC_WS_URL

npm install
npm run dev
# → http://localhost:3000
```

Backend must be running on port 3001 (see `backend/README.md`).

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | tsc --noEmit |

---

## Pages

### Landing Page — `/`

**File:** `app/page.tsx`

Three-column mode selector:

| Mode | Name | Status |
|---|---|---|
| 1 | Describe It | Active |
| 2 | Upload Reference | Coming soon |
| 3 | Play Live | Coming soon |

Mode 1 routes to `/studio`. Modes 2 and 3 are visually present but disabled.

Below the mode selector: feature highlights (Instant Compilation, Studio-Grade DSP, In-Browser Preview).

### Plugin Studio — `/studio`

**File:** `app/studio/page.tsx`

Split layout:
- **Left (420px):** `ChatPanel` — streaming AI chat interface
- **Right (flex):** `PluginPreview` — build status, parameter display, download links

State managed in the Studio page:
- `dspSpec` — populated when Claude returns a spec
- `compileStatus` — `idle | compiling | ready | failed`
- `downloadUrl` — artifact URLs from completed build
- `pluginName` — derived from DspSpec

---

## Components

### `components/chat/ChatPanel.tsx`

Streaming AI chat panel.

**What it does:**
- Displays welcome message and example prompts on load
- Opens an SSE connection to `/api/chat/stream` on user submit
- Listens for three SSE event types:
  - `token` — appends to the in-progress message
  - `dspSpec` — signals a complete DspSpec JSON was returned; enables the Build button
  - `done` — closes stream
- Falls back to a mock DspSpec response if SSE is unavailable (dev convenience)
- Build button becomes active when a valid DspSpec is present

**Props:**
```typescript
{
  onDspSpec: (spec: DspSpec) => void   // called when Claude returns a spec
  onBuild: () => void                  // called when user clicks Build
  buildEnabled: boolean                // controls Build button state
}
```

### `components/preview/PluginPreview.tsx`

Shows build progress and download links.

**States:**
- `idle` — placeholder, waiting for a DspSpec
- `compiling` — spinner + step indicator, live status from WebSocket
- `ready` — download buttons for AU, VST3, PKG
- `failed` — error message with `errorLog` from the compilation job

**Props:**
```typescript
{
  pluginId: string | null
  status: 'idle' | 'compiling' | 'ready' | 'failed'
  dspSpec: DspSpec | null
  downloadUrls: { auUrl?: string; vst3Url?: string; pkgUrl?: string } | null
}
```

### `components/preview/WebAudioPreview.tsx`

In-browser audio preview using Tone.js 15.

Renders a simple signal chain based on the DspSpec type — lets the user hear a rough approximation of the plugin character before the real build finishes. Uses Web Audio API oscillators, filters, and reverb nodes mapped from the DspSpec parameters.

---

## API Client (`lib/api.ts`)

Zod schemas and fetch wrappers for backend communication.

**Schemas:**
- `DspParam` — single parameter definition (id, label, min, max, default, unit, taper)
- `DspSpec` — full spec (type, algorithm, templateId, parameters, signalFlow)
- `ChatMessage` — chat message (role, content)
- `BuildRequest` — plugin build request
- `BuildResponse` — build response (jobId, compilationJobId, status)
- `BuildStatus` — poll response (status, auUrl, vst3Url, pkgUrl, compilationJob)

**Functions:**
- `streamChat(description, onToken, onDspSpec, onDone)` — SSE stream
- `sendMessage(message)` — non-streaming message
- `buildPlugin(pluginId)` — POST /api/plugins/:id/compile
- `getBuildStatus(pluginId)` — GET /api/plugins/:id/status

---

## Environment Variables

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

Both are prefixed `NEXT_PUBLIC_` so they're available in browser code.

---

## Project Structure

```
frontend/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── layout.tsx                  # Root layout (metadata, fonts)
│   └── studio/
│       └── page.tsx                # Plugin builder studio
├── components/
│   ├── chat/
│   │   └── ChatPanel.tsx           # Streaming AI chat
│   └── preview/
│       ├── PluginPreview.tsx       # Build status + download
│       └── WebAudioPreview.tsx     # In-browser Tone.js preview
├── lib/
│   ├── api.ts                      # API client + Zod schemas
│   └── utils.ts                    # Shared utilities
├── .env.local.example
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.js
└── tsconfig.json
```

---

## Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| next | 14.2.5 | Framework (App Router) |
| react | 18.3.1 | UI |
| tailwindcss | 3.4.6 | Styling |
| framer-motion | 11.3.19 | Animations |
| tone | 15.0.4 | Web Audio preview |
| socket.io-client | 4.7.5 | WebSocket status updates |
| @radix-ui/* | various | Slider, Dialog, Tooltip, Dropdown components |
| lucide-react | 0.400.0 | Icons |
| zod | 3.23.8 | Schema validation |
