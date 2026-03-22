import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'https://chris-plugin-backend-production.up.railway.app'

type FrontendStatus = 'queued' | 'compiling' | 'done' | 'failed'

const STATUS_MAP: Record<string, FrontendStatus> = {
  PENDING:   'queued',
  QUEUED:    'queued',
  COMPILING: 'compiling',
  READY:     'done',
  FAILED:    'failed',
}

const PROGRESS_MAP: Record<FrontendStatus, number> = {
  queued:    10,
  compiling: 50,
  done:      100,
  failed:    0,
}

interface BackendStatusResponse {
  pluginId: string
  name:     string
  status:   string
  downloads: {
    au:   string | null
    vst3: string | null
    pkg:  string | null
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params

  // jobId format: "pluginId:compilationJobId" or just "pluginId"
  const pluginId = jobId.includes(':') ? jobId.split(':')[0] : jobId

  try {
    const res = await fetch(`${BACKEND_URL}/api/plugins/${pluginId}/status`)
    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ error: errText }, { status: res.status })
    }

    const data = (await res.json()) as BackendStatusResponse
    const status: FrontendStatus = STATUS_MAP[data.status] ?? 'queued'
    const progress = PROGRESS_MAP[status]

    const result =
      status === 'done'
        ? {
            downloadUrl: data.downloads.pkg ?? data.downloads.vst3 ?? data.downloads.au ?? '',
            pkgUrl:      data.downloads.pkg ?? '',
          }
        : undefined

    return NextResponse.json({ jobId, status, progress, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Status check failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
