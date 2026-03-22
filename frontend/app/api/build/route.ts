import { NextRequest, NextResponse } from 'next/server'
import type { DspSpec } from '@/lib/api'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'https://chris-plugin-backend-production.up.railway.app'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CompileResponse {
  jobId:            string | number
  compilationJobId: string
  pluginId:         string
  status:           string
}

interface GenerateResponse {
  pluginId: string
  name:     string
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { spec: DspSpec; pluginId?: string }
  const { spec, pluginId: providedId } = body

  try {
    // Determine pluginId — use provided if it looks like a real UUID, else generate
    let pluginId = providedId ?? spec.id
    if (!pluginId || !UUID_RE.test(pluginId)) {
      // Create a new plugin record via generate
      const genRes = await fetch(`${BACKEND_URL}/api/plugins/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ description: spec.description, mode: 2 }),
      })
      if (!genRes.ok) {
        const errText = await genRes.text()
        return NextResponse.json({ error: errText }, { status: genRes.status })
      }
      const genData = (await genRes.json()) as GenerateResponse
      pluginId = genData.pluginId
    }

    // Trigger compilation
    const compileRes = await fetch(
      `${BACKEND_URL}/api/plugins/${pluginId}/compile`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      }
    )

    if (!compileRes.ok) {
      const errText = await compileRes.text()
      return NextResponse.json({ error: errText }, { status: compileRes.status })
    }

    const compileData = (await compileRes.json()) as CompileResponse

    // Encode both IDs into jobId so the status route can use pluginId
    const jobId = `${pluginId}:${compileData.compilationJobId}`

    return NextResponse.json({ jobId, pluginId, status: 'queued' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Build failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
