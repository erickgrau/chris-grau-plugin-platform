# Backend — Chris Grau Plugin Platform

Fastify 4 API server + BullMQ worker. Handles plugin generation, compilation jobs, and real-time status.

---

## Quick Start

```bash
cd backend
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and GITHUB_TOKEN at minimum

npm install
npm run prisma:migrate
npm run dev
# → http://localhost:3001
```

Make sure Docker is running first (`docker compose up -d` from repo root).

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | tsx watch — hot reload |
| `npm run build` | tsc compile to dist/ |
| `npm start` | Run compiled output |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:migrate` | Apply pending migrations |
| `npm run prisma:studio` | Open Prisma Studio at localhost:5555 |

---

## API Endpoints

### Health Check

**`GET /health`**

```json
{ "status": "ok" }
```

---

### Generate DspSpec

**`POST /api/plugins/generate`**

Sends a natural language description to Claude 3.5 Sonnet and returns a structured DspSpec.

**Request:**
```json
{
  "description": "A warm plate reverb with pre-delay and dry/wet mix",
  "mode": 1,
  "userId": "optional-user-id"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `description` | string | Yes | Natural language plugin description |
| `mode` | 1 \| 2 \| 3 | No | Build mode (default: 1) |
| `userId` | string | No | User ID — creates dev user if omitted |

**Response `200`:**
```json
{
  "pluginId": "cma1b2c3d4e5f",
  "dspSpec": {
    "type": "effect",
    "algorithm": "plate_reverb",
    "templateId": "reverb-plate-v1",
    "parameters": [
      {
        "id": "roomSize",
        "label": "Room Size",
        "min": 0,
        "max": 1,
        "default": 0.6,
        "unit": "",
        "taper": "linear"
      },
      {
        "id": "preDelay",
        "label": "Pre-Delay",
        "min": 0,
        "max": 100,
        "default": 20,
        "unit": "ms",
        "taper": "linear"
      },
      {
        "id": "mix",
        "label": "Dry/Wet",
        "min": 0,
        "max": 1,
        "default": 0.3,
        "unit": "",
        "taper": "linear"
      }
    ],
    "signalFlow": ["input", "preDelay", "plateReverb", "dryWetMix", "output"]
  }
}
```

**Errors:**
- `400` — missing or invalid `description`
- `429` — FREE tier build limit reached (3/month)
- `500` — Claude API error

---

### Compile Plugin

**`POST /api/plugins/:id/compile`**

Enqueues a BullMQ compilation job. Returns immediately (async — 202 Accepted).

**Request body:** empty `{}` or omit

**Response `202`:**
```json
{
  "jobId": "bullmq-job-id",
  "compilationJobId": "cma9x8y7z6w5v",
  "status": "QUEUED"
}
```

**Errors:**
- `404` — plugin not found
- `409` — plugin already compiling

---

### Get Plugin Status

**`GET /api/plugins/:id/status`**

Returns the current plugin status and download URLs (populated after successful build).

**Response `200`:**
```json
{
  "pluginId": "cma1b2c3d4e5f",
  "status": "READY",
  "auUrl": "https://objects.githubusercontent.com/.../MyPlugin.component.zip",
  "vst3Url": "https://objects.githubusercontent.com/.../MyPlugin.vst3.zip",
  "pkgUrl": "https://objects.githubusercontent.com/.../MyPlugin-1.0.0-installer.pkg",
  "compilationJob": {
    "id": "cma9x8y7z6w5v",
    "status": "COMPLETED",
    "startedAt": "2026-03-22T10:00:00Z",
    "completedAt": "2026-03-22T10:08:30Z",
    "auvalResult": "PASS",
    "pluginvalResult": "PASS"
  }
}
```

Possible `status` values: `PENDING`, `COMPILING`, `READY`, `FAILED`

**Errors:**
- `404` — plugin not found

---

### List Plugins

**`GET /api/plugins`**

Returns all plugins for a user.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `userId` | string | Filter by user (defaults to dev user in dev mode) |
| `limit` | number | Max results (default: 20) |
| `offset` | number | Pagination offset |

**Response `200`:**
```json
{
  "plugins": [
    {
      "id": "cma1b2c3d4e5f",
      "name": "My Reverb",
      "description": "warm plate reverb...",
      "status": "READY",
      "createdAt": "2026-03-22T10:00:00Z"
    }
  ],
  "total": 1
}
```

---

### WebSocket — Build Status

**`WS /ws/plugins/:id/status`**

Real-time build status updates. Server polls the DB every 5 seconds and pushes:

```json
{
  "status": "COMPILING",
  "auUrl": null,
  "vst3Url": null,
  "pkgUrl": null,
  "errorLog": null
}
```

Connection closes when status becomes `READY` or `FAILED`.

---

## BullMQ Worker

**File:** `src/jobs/compile.ts`

The worker runs in the same process as the API server unless `START_WORKER=false`.

**Queue name:** `compile-plugin`
**Concurrency:** 5 parallel jobs

**Job data shape:**
```typescript
{
  pluginId: string
  compilationJobId: string
}
```

**Job steps:**
1. Update `CompilationJob.status` → `RUNNING`
2. `POST /repos/{owner}/{repo}/actions/workflows/{workflowId}/dispatches`
   - Inputs: `template_name`, `plugin_name`, `dsp_spec_json`
3. Poll `GET /repos/{owner}/{repo}/actions/runs` every 15 seconds
4. Timeout after 20 minutes → mark `FAILED`
5. On GitHub run `completed`:
   - Fetch artifact download URLs
   - Update `Plugin.auUrl`, `Plugin.vst3Url`, `Plugin.pkgUrl`
   - Update `Plugin.status` → `READY`
   - Update `CompilationJob.status` → `COMPLETED`
6. On any error: `retryCount++`, retry up to 3× with exponential backoff

---

## Prisma Schema

**5 models:**

```prisma
model User {
  id               String    @id @default(cuid())
  email            String    @unique
  name             String?
  tier             Tier      @default(FREE)     // FREE | PRO | CREATOR
  buildsThisMonth  Int       @default(0)
  stripeCustomerId String?
  createdAt        DateTime  @default(now())
  plugins          Plugin[]
}

model Plugin {
  id          String        @id @default(cuid())
  userId      String
  name        String
  description String?
  mode        Int           @default(1)
  dspSpec     Json
  guiSpec     Json?
  status      PluginStatus  @default(PENDING)   // PENDING|COMPILING|READY|FAILED
  auUrl       String?
  vst3Url     String?
  pkgUrl      String?
  version     String        @default("1.0.0")
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  user        User          @relation(...)
  compilationJobs CompilationJob[]
  presets     Preset[]
  listings    MarketplaceListing[]
}

model CompilationJob {
  id              String         @id @default(cuid())
  pluginId        String
  status          JobStatus      // QUEUED|RUNNING|COMPLETED|FAILED
  runnerId        String?
  startedAt       DateTime?
  completedAt     DateTime?
  auvalResult     String?
  pluginvalResult String?
  errorLog        String?
  retryCount      Int            @default(0)
  plugin          Plugin         @relation(...)
}

model Preset {
  id          String   @id @default(cuid())
  pluginId    String
  userId      String
  name        String
  parameters  Json
  isPublic    Boolean  @default(false)
}

model MarketplaceListing {
  id       String   @id @default(cuid())
  pluginId String
  userId   String
  price    Decimal
  sales    Int      @default(0)
  rating   Float?
}
```

---

## Project Structure

```
backend/
├── src/
│   ├── index.ts           # Server entry — registers routes, CORS, WebSocket, worker
│   ├── routes/
│   │   └── plugins.ts     # All plugin endpoints + Zod validation
│   ├── services/
│   │   └── ai.ts          # Claude 3.5 Sonnet integration, DspSpec generation
│   └── jobs/
│       └── compile.ts     # BullMQ worker — GitHub Actions trigger + polling
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── migrations/        # SQL migration history
├── .env.example           # All required vars with descriptions
├── package.json
└── tsconfig.json
```

---

## Environment Variables

See root `README.md` for the full reference table. At minimum you need:

```bash
DATABASE_URL=postgresql://...
REDIS_HOST=localhost
REDIS_PORT=6379
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=erickgrau
GITHUB_REPO=chris-grau-plugin-platform
GITHUB_WORKFLOW_ID=compile-plugin.yml
CORS_ORIGIN=http://localhost:3000
```
