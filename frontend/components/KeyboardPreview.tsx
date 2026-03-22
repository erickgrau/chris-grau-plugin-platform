'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'

// ─── Props ────────────────────────────────────────────────────────────────────

interface KeyboardPreviewProps {
  pluginId: string
  pluginName: string
  isOpen: boolean
  onClose: () => void
}

// ─── Piano layout constants ───────────────────────────────────────────────────

const WHITE_KEY_WIDTH  = 40   // px
const WHITE_KEY_HEIGHT = 140  // px
const BLACK_KEY_WIDTH  = 24   // px
const BLACK_KEY_HEIGHT = 90   // px

// Within one octave (starting from C), the indices of white keys and their note offsets
// C=0, D=2, E=4, F=5, G=7, A=9, B=11
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11] as const
// C#=1, D#=3, F#=6, G#=8, A#=10
const BLACK_OFFSETS = [1, 3, 6, 8, 10] as const
// Left positions of black keys within an octave (relative to octave's left edge)
// Centered between adjacent white keys
const BLACK_LEFT_IN_OCTAVE = [
  WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2,               // C# (between C and D)
  WHITE_KEY_WIDTH * 2 - BLACK_KEY_WIDTH / 2,           // D# (between D and E)
  WHITE_KEY_WIDTH * 4 - BLACK_KEY_WIDTH / 2,           // F# (between F and G)
  WHITE_KEY_WIDTH * 5 - BLACK_KEY_WIDTH / 2,           // G# (between G and A)
  WHITE_KEY_WIDTH * 6 - BLACK_KEY_WIDTH / 2,           // A# (between A and B)
] as const

// ─── Key data ─────────────────────────────────────────────────────────────────

interface PianoKey {
  note: number   // MIDI note
  isBlack: boolean
  left: number   // px from keyboard left
}

function buildKeys(): PianoKey[] {
  const keys: PianoKey[] = []
  const startNote = 48  // C3

  for (let octave = 0; octave < 2; octave++) {
    const baseNote   = startNote + octave * 12
    const octaveLeft = octave * 7 * WHITE_KEY_WIDTH

    WHITE_OFFSETS.forEach((offset, idx) => {
      keys.push({ note: baseNote + offset, isBlack: false, left: octaveLeft + idx * WHITE_KEY_WIDTH })
    })

    BLACK_OFFSETS.forEach((offset, idx) => {
      keys.push({ note: baseNote + offset, isBlack: true, left: octaveLeft + BLACK_LEFT_IN_OCTAVE[idx] })
    })
  }

  return keys
}

const PIANO_KEYS = buildKeys()
const KEYBOARD_WIDTH = 14 * WHITE_KEY_WIDTH  // 2 octaves × 7 white keys

// ─── Component ────────────────────────────────────────────────────────────────

export default function KeyboardPreview({
  pluginId,
  pluginName,
  isOpen,
  onClose,
}: KeyboardPreviewProps) {
  const [loadingNote, setLoadingNote] = useState<number | null>(null)
  const [playingNote, setPlayingNote] = useState<number | null>(null)
  const audioCtxRef  = useRef<AudioContext | null>(null)

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const playNote = useCallback(async (note: number) => {
    if (loadingNote !== null) return  // already loading another key

    setLoadingNote(note)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
      const res = await fetch(`${apiUrl}/api/plugins/${pluginId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
        console.error('Preview API error:', errData.error)
        return
      }

      const arrayBuffer = await res.arrayBuffer()

      // Lazily create AudioContext
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)

      setPlayingNote(note)
      source.start()
      source.onended = () => setPlayingNote(prev => (prev === note ? null : prev))
    } catch (err) {
      console.error('Preview playback error:', err)
    } finally {
      setLoadingNote(null)
    }
  }, [loadingNote, pluginId])

  if (!isOpen) return null

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Modal */}
      <div className="relative bg-studio-darker border border-studio-border rounded-2xl shadow-2xl overflow-hidden max-w-[640px] w-full mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-studio-border">
          <div>
            <h2 className="text-white font-semibold text-sm tracking-wide">{pluginName}</h2>
            <p className="text-studio-muted text-xs mt-0.5">Tap a key to preview · C3 – B4</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-studio-muted hover:text-white hover:bg-studio-mid transition-colors"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Keyboard container — scrollable on narrow screens */}
        <div className="overflow-x-auto px-4 py-6">
          <div
            className="relative mx-auto select-none"
            style={{ width: KEYBOARD_WIDTH, height: WHITE_KEY_HEIGHT }}
          >
            {/* White keys first (rendered under black keys) */}
            {PIANO_KEYS.filter(k => !k.isBlack).map(key => {
              const isLoading = loadingNote === key.note
              const isPlaying = playingNote === key.note
              return (
                <button
                  key={key.note}
                  onMouseDown={() => playNote(key.note)}
                  onTouchStart={(e) => { e.preventDefault(); playNote(key.note) }}
                  style={{
                    position: 'absolute',
                    left: key.left,
                    top: 0,
                    width: WHITE_KEY_WIDTH - 2,
                    height: WHITE_KEY_HEIGHT,
                  }}
                  className={`
                    rounded-b-lg border border-gray-400 transition-colors
                    flex flex-col items-center justify-end pb-2
                    ${isLoading ? 'bg-amber-200' : isPlaying ? 'bg-amber-100' : 'bg-white hover:bg-gray-100 active:bg-amber-100'}
                    focus:outline-none
                  `}
                  aria-label={`MIDI note ${key.note}`}
                >
                  {isLoading && (
                    <Loader2 className="w-3 h-3 text-amber-600 animate-spin mb-1" />
                  )}
                  {isPlaying && !isLoading && (
                    <div className="w-2 h-2 rounded-full bg-amber-500 mb-1" />
                  )}
                </button>
              )
            })}

            {/* Black keys on top */}
            {PIANO_KEYS.filter(k => k.isBlack).map(key => {
              const isLoading = loadingNote === key.note
              const isPlaying = playingNote === key.note
              return (
                <button
                  key={key.note}
                  onMouseDown={() => playNote(key.note)}
                  onTouchStart={(e) => { e.preventDefault(); playNote(key.note) }}
                  style={{
                    position: 'absolute',
                    left: key.left,
                    top: 0,
                    width: BLACK_KEY_WIDTH,
                    height: BLACK_KEY_HEIGHT,
                    zIndex: 10,
                  }}
                  className={`
                    rounded-b-md transition-colors
                    flex flex-col items-center justify-end pb-1.5
                    ${isLoading ? 'bg-amber-700' : isPlaying ? 'bg-amber-800' : 'bg-gray-900 hover:bg-gray-700 active:bg-amber-800'}
                    focus:outline-none
                  `}
                  aria-label={`MIDI note ${key.note}`}
                >
                  {isLoading && (
                    <Loader2 className="w-2.5 h-2.5 text-amber-300 animate-spin" />
                  )}
                  {isPlaying && !isLoading && (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-studio-border bg-studio-dark">
          <p className="text-xs text-studio-muted text-center">
            {loadingNote !== null
              ? 'Rendering preview…'
              : playingNote !== null
              ? 'Playing…'
              : 'Click or tap a key to hear the plugin'}
          </p>
        </div>
      </div>
    </div>
  )
}
