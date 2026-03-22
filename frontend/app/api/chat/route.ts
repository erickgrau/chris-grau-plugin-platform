import { NextRequest, NextResponse } from 'next/server'
import { generateId } from '@/lib/api'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      message: string
      history: Array<{ role: string; content: string }>
      sessionId?: string
    }

    const { message } = body

    const backendRes = await fetch(`${BACKEND_URL}/api/plugins/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: message, mode: 1 }),
    })

    if (!backendRes.ok) {
      const errText = await backendRes.text().catch(() => 'Backend error')
      return NextResponse.json({ error: errText }, { status: backendRes.status })
    }

    const data = await backendRes.json() as {
      pluginId: string
      name: string
      dspSpec: unknown
      status: string
      message: string
    }

    return NextResponse.json({
      message: {
        id:        generateId(),
        role:      'assistant',
        content:   data.message ?? `I've designed **${data.name}** for you. Hit Build Plugin to compile it.`,
        timestamp: Date.now(),
        dspSpec:   data.dspSpec ?? null,
      },
      dspSpec: data.dspSpec ?? null,
    })
  } catch (err) {
    console.error('[/api/chat] Error:', err)
    return NextResponse.json(
      { error: 'Failed to contact backend' },
      { status: 500 }
    )
  }
}
