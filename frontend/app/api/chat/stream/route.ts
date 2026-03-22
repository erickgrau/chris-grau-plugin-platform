import { NextRequest } from 'next/server'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'https://chris-plugin-backend-production.up.railway.app'

// Map backend layer type to frontend category enum
const LAYER_TYPE_TO_CATEGORY: Record<string, string> = {
  reverb:     'reverb',
  delay:      'delay',
  eq:         'eq',
  chorus:     'modulation',
  compressor: 'dynamics',
  distortion: 'saturation',
  filter:     'filter',
}

function sse(eventName: string, data: string): string {
  const dataLines = data.split('\n').map(l => `data: ${l}`).join('\n')
  return `event: ${eventName}\n${dataLines}\n\n`
}

interface BackendParam {
  id:      string
  name:    string
  min:     number
  max:     number
  default: number
  unit:    string
}

interface BackendLayer {
  id:         string
  type:       string
  label:      string
  blend:      number
  parameters: BackendParam[]
}

interface BackendDspSpec {
  plugin_type:    string
  plugin_version: string
  description:    string
  layers:         BackendLayer[]
  signalFlow:     string[]
}

interface GenerateResponse {
  pluginId: string
  name:     string
  dspSpec:  BackendDspSpec
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const message = searchParams.get('message') || ''

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(encoder.encode(s))

      try {
        // Send immediate thinking tokens
        enqueue(sse('token', 'Analyzing your description... '))

        // Call backend
        const res = await fetch(`${BACKEND_URL}/api/plugins/generate`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ description: message, mode: 2 }),
        })

        if (!res.ok) {
          const errText = await res.text()
          throw new Error(errText || `Backend error ${res.status}`)
        }

        const data = (await res.json()) as GenerateResponse
        const { pluginId, name, dspSpec: backendSpec } = data

        // Flatten layered params into the frontend flat format
        const params = backendSpec.layers.flatMap(layer =>
          layer.parameters.map(p => ({
            id:      `${layer.id}_${p.id}`,
            name:    p.name,
            type:    'knob' as const,
            min:     p.min,
            max:     p.max,
            default: p.default,
            unit:    p.unit !== 'linear' ? p.unit : undefined,
          }))
        )

        const firstLayerType = backendSpec.layers[0]?.type ?? 'other'
        const category = LAYER_TYPE_TO_CATEGORY[firstLayerType] ?? 'other'

        const frontendSpec = {
          id:          pluginId,
          name,
          category,
          description: backendSpec.description,
          params,
          version:     backendSpec.plugin_version || '0.1.0',
        }

        // Stream description text as more tokens
        const summary =
          `Done.\n\nHere's your **${name}**. ${backendSpec.description}\n\nHit **Build Plugin** to compile it into a real AU/VST3.`
        enqueue(sse('token', summary))

        // Send spec event
        enqueue(sse('dspSpec', JSON.stringify(frontendSpec)))

        // Done
        enqueue(sse('done', ''))
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generation failed'
        enqueue(sse('token', `\n\nError: ${msg}`))
        enqueue(sse('done', ''))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
