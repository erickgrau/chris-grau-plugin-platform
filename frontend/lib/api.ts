import { z } from 'zod'

// ─── DSP Spec Schema ────────────────────────────────────────────────────────
// The core data model returned by the AI for a plugin design.

export const DspParamSchema = z.object({
  id:          z.string(),
  name:        z.string(),
  type:        z.enum(['knob', 'slider', 'toggle', 'select']),
  min:         z.number(),
  max:         z.number(),
  default:     z.number(),
  unit:        z.string().optional(),  // e.g. "dB", "ms", "Hz", "%"
  description: z.string().optional(),
})

export const DspSpecSchema = z.object({
  id:          z.string(),
  name:        z.string(),
  category:    z.enum(['dynamics', 'eq', 'reverb', 'delay', 'saturation', 'filter', 'modulation', 'utility', 'other']),
  description: z.string(),
  params:      z.array(DspParamSchema),
  algorithm:   z.string().optional(),   // DSP algorithm hint
  latency:     z.number().optional(),   // samples
  version:     z.string().default('0.1.0'),
  createdAt:   z.string().optional(),
})

export type DspParam = z.infer<typeof DspParamSchema>
export type DspSpec  = z.infer<typeof DspSpecSchema>

// ─── Chat Types ─────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id:        string
  role:      MessageRole
  content:   string
  timestamp: number
  streaming?: boolean
  dspSpec?:  DspSpec
}

export interface ChatRequest {
  message:  string
  history:  Array<{ role: MessageRole; content: string }>
  sessionId?: string
}

// ─── Build Types ─────────────────────────────────────────────────────────────

export interface BuildRequest {
  spec: DspSpec
  format?: 'au' | 'vst3' | 'both'
}

export interface BuildResponse {
  jobId:       string
  downloadUrl: string
  format:      string
  size:        number
  buildTime:   number
}

export interface BuildStatus {
  jobId:    string
  status:   'queued' | 'compiling' | 'done' | 'failed'
  progress: number   // 0–100
  message?: string
  result?:  BuildResponse
}

// ─── API Client ─────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const error = await res.text().catch(() => 'Unknown error')
    throw new ApiError(res.status, error)
  }

  return res.json() as Promise<T>
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ─── Chat API ─────────────────────────────────────────────────────────────

/**
 * Send a chat message and get back a streaming response via the returned EventSource.
 * The backend emits Server-Sent Events with token chunks, then a final `dspSpec` event.
 */
export function streamChat(request: ChatRequest): EventSource {
  const params = new URLSearchParams({
    message:  request.message,
    history:  JSON.stringify(request.history),
    ...(request.sessionId ? { sessionId: request.sessionId } : {}),
  })
  return new EventSource(`${BASE_URL}/api/chat/stream?${params}`)
}

/**
 * Non-streaming chat (for simple queries).
 */
export async function sendMessage(request: ChatRequest): Promise<{
  message: ChatMessage
  dspSpec?: DspSpec
}> {
  return apiRequest('/api/chat', {
    method: 'POST',
    body:   JSON.stringify(request),
  })
}

// ─── Build API ────────────────────────────────────────────────────────────

/**
 * Kick off a plugin build job.
 */
export async function buildPlugin(request: BuildRequest): Promise<BuildResponse> {
  return apiRequest('/api/build', {
    method: 'POST',
    body:   JSON.stringify(request),
  })
}

/**
 * Poll a build job status.
 */
export async function getBuildStatus(jobId: string): Promise<BuildStatus> {
  return apiRequest(`/api/build/${jobId}`)
}

// ─── Helpers ─────────────────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Parse and validate a raw object as a DspSpec.
 * Returns null if validation fails.
 */
export function parseDspSpec(raw: unknown): DspSpec | null {
  const result = DspSpecSchema.safeParse(raw)
  return result.success ? result.data : null
}

/**
 * Format a param value for display.
 */
export function formatParamValue(param: DspParam, value: number): string {
  if (param.unit) {
    if (param.unit === 'dB') return `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`
    if (param.unit === 'ms') return `${value.toFixed(0)} ms`
    if (param.unit === 'Hz') return value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${value.toFixed(0)} Hz`
    if (param.unit === '%')  return `${value.toFixed(0)}%`
    return `${value.toFixed(2)} ${param.unit}`
  }
  return value.toFixed(2)
}
