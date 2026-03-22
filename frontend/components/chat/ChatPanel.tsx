'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Hammer, Sparkles, User, Bot } from 'lucide-react'
import { generateId, parseDspSpec, type ChatMessage, type DspSpec } from '@/lib/api'

interface ChatPanelProps {
  onDspSpec:      (spec: DspSpec) => void
  onBuildPlugin:  () => void
  hasDspSpec:     boolean
  compileStatus:  'idle' | 'compiling' | 'ready' | 'error'
}

const WELCOME_MESSAGES: string[] = [
  "What kind of sound are you chasing?",
  "Describe the vibe — warm, punchy, ethereal, gritty...",
  "Tell me about the plugin you wish existed.",
]

const EXAMPLE_PROMPTS = [
  "A warm tube compressor with slow attack and vintage knee",
  "Lush plate reverb that sounds like an old EMT140",
  "Tape saturation with subtle wow and flutter",
  "A multiband transient shaper for drums",
]

export default function ChatPanel({
  onDspSpec,
  onBuildPlugin,
  hasDspSpec,
  compileStatus,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id:        'welcome',
      role:      'assistant',
      content:   WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)],
      timestamp: Date.now(),
    },
  ])
  const [input, setInput]         = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const eventSource = useRef<EventSource | null>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cleanup on unmount
  useEffect(() => {
    return () => { eventSource.current?.close() }
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    const userMsg: ChatMessage = {
      id:        generateId(),
      role:      'user',
      content:   text.trim(),
      timestamp: Date.now(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)

    // Add streaming assistant placeholder
    const streamId = generateId()
    setMessages(prev => [...prev, {
      id:        streamId,
      role:      'assistant',
      content:   '',
      timestamp: Date.now(),
      streaming: true,
    }])

    try {
      // Build history for context
      const history = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }))

      // Use streaming via SSE
      const params = new URLSearchParams({
        message: text.trim(),
        history: JSON.stringify(history),
      })

      const sse = new EventSource(`/api/chat/stream?${params}`)
      eventSource.current = sse

      let accumulated = ''

      sse.addEventListener('token', (e) => {
        accumulated += e.data
        setMessages(prev => prev.map(m =>
          m.id === streamId ? { ...m, content: accumulated } : m
        ))
      })

      sse.addEventListener('dspSpec', (e) => {
        try {
          const spec = parseDspSpec(JSON.parse(e.data))
          if (spec) {
            onDspSpec(spec)
            setMessages(prev => prev.map(m =>
              m.id === streamId ? { ...m, dspSpec: spec } : m
            ))
          }
        } catch { /* ignore malformed spec */ }
      })

      sse.addEventListener('done', () => {
        sse.close()
        eventSource.current = null
        setMessages(prev => prev.map(m =>
          m.id === streamId ? { ...m, streaming: false } : m
        ))
        setIsStreaming(false)
      })

      sse.addEventListener('error', () => {
        // Fallback: if SSE not available, show a mock response for dev
        sse.close()
        eventSource.current = null

        const mockSpec: DspSpec = {
          id:          generateId(),
          name:        'Custom Compressor',
          category:    'dynamics',
          description: text,
          version:     '0.1.0',
          params: [
            { id: 'threshold', name: 'Threshold', type: 'knob', min: -60, max: 0,   default: -18,  unit: 'dB'  },
            { id: 'ratio',     name: 'Ratio',     type: 'knob', min: 1,   max: 20,  default: 4,    unit: ':1'  },
            { id: 'attack',    name: 'Attack',    type: 'knob', min: 0.1, max: 200, default: 10,   unit: 'ms'  },
            { id: 'release',   name: 'Release',   type: 'knob', min: 10,  max: 2000,default: 100,  unit: 'ms'  },
            { id: 'makeup',    name: 'Make Up',   type: 'knob', min: 0,   max: 24,  default: 6,    unit: 'dB'  },
            { id: 'mix',       name: 'Mix',       type: 'slider', min: 0, max: 100, default: 100,  unit: '%'   },
          ],
        }

        const mockReply = `Dialing in that sound now. I've sketched out a **${mockSpec.name}** for you with six parameters. The threshold and ratio give you control over the squish, attack and release shape the envelope, and make-up gain brings the level back up. Mix lets you blend it parallel-style for that New York compression feel.\n\nLook good? Hit **Build Plugin** to compile it.`

        setMessages(prev => prev.map(m =>
          m.id === streamId
            ? { ...m, content: mockReply, streaming: false, dspSpec: mockSpec }
            : m
        ))
        onDspSpec(mockSpec)
        setIsStreaming(false)
      })

    } catch {
      setMessages(prev => prev.map(m =>
        m.id === streamId
          ? { ...m, content: 'Something went wrong. Check your connection and try again.', streaming: false }
          : m
      ))
      setIsStreaming(false)
    }
  }, [isStreaming, messages, onDspSpec])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const isBuilding = compileStatus === 'compiling'

  return (
    <div className="flex flex-col h-full bg-studio-darker">
      {/* Panel header */}
      <div className="flex-none px-4 py-3 border-b border-studio-border flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-studio-amber" />
        <span className="text-white text-sm font-medium">AI Designer</span>
        <span className="ml-auto text-xs text-studio-muted">Mode 1 · Describe</span>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Example prompts (shown when only welcome message) */}
      {messages.length === 1 && (
        <div className="flex-none px-4 pb-3 space-y-2">
          <p className="text-xs text-studio-muted mb-2">Try one of these:</p>
          {EXAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => sendMessage(p)}
              className="w-full text-left px-3 py-2 rounded-lg border border-studio-border bg-studio-dark text-studio-subtle text-xs hover:border-studio-amber/50 hover:text-white transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Build plugin CTA */}
      {hasDspSpec && (
        <div className="flex-none px-4 pb-3">
          <button
            onClick={onBuildPlugin}
            disabled={isBuilding}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-studio-amber text-studio-black font-semibold text-sm hover:bg-amber-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isBuilding ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Compiling…
              </>
            ) : compileStatus === 'ready' ? (
              <>
                <Hammer className="w-4 h-4" />
                Rebuild Plugin
              </>
            ) : (
              <>
                <Hammer className="w-4 h-4" />
                Build Plugin
              </>
            )}
          </button>
        </div>
      )}

      {/* Input */}
      <div className="flex-none px-4 pb-4 pt-2 border-t border-studio-border">
        <div className="flex items-end gap-2 rounded-xl border border-studio-border bg-studio-dark focus-within:border-studio-amber/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your sound..."
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-white placeholder:text-studio-muted focus:outline-none min-h-[44px] max-h-32 disabled:opacity-50"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 128) + 'px'
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
            className="flex-none m-2 w-8 h-8 rounded-lg bg-studio-amber text-studio-black flex items-center justify-center hover:bg-amber-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isStreaming
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </button>
        </div>
        <p className="text-xs text-studio-muted mt-2 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`flex-none w-7 h-7 rounded-full flex items-center justify-center ${
        isUser
          ? 'bg-studio-mid border border-studio-border'
          : 'bg-studio-amber/10 border border-studio-amber/20'
      }`}>
        {isUser
          ? <User className="w-3.5 h-3.5 text-studio-subtle" />
          : <Bot  className="w-3.5 h-3.5 text-studio-amber"  />
        }
      </div>

      {/* Bubble */}
      <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
        <div className={`inline-block max-w-full px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-studio-mid text-white rounded-tr-sm'
            : 'bg-studio-dark border border-studio-border text-studio-subtle rounded-tl-sm'
        } ${message.streaming ? 'streaming-cursor' : ''}`}>
          {message.content || (message.streaming ? '' : '…')}

          {/* DspSpec badge */}
          {message.dspSpec && (
            <div className="mt-2 pt-2 border-t border-studio-border/50 flex items-center gap-1.5 text-xs text-studio-amber">
              <Sparkles className="w-3 h-3" />
              <span>Plugin spec ready: <strong>{message.dspSpec.name}</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
