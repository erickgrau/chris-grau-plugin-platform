'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Play, Pause, UploadCloud, ToggleLeft, ToggleRight, Volume2, AlertCircle } from 'lucide-react'
import type { DspSpec } from '@/lib/api'

interface WebAudioPreviewProps {
  spec: DspSpec | null
}

type ABMode = 'dry' | 'wet'

export default function WebAudioPreview({ spec }: WebAudioPreviewProps) {
  const [isPlaying, setIsPlaying]   = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName]     = useState<string | null>(null)
  const [abMode, setAbMode]         = useState<ABMode>('wet')
  const [error, setError]           = useState<string | null>(null)
  const [mixLevel, setMixLevel]     = useState(1.0)   // 0–1

  // Web Audio refs
  const audioCtxRef    = useRef<AudioContext | null>(null)
  const sourceRef      = useRef<AudioBufferSourceNode | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const gainDryRef     = useRef<GainNode | null>(null)
  const gainWetRef     = useRef<GainNode | null>(null)
  const reverbRef      = useRef<ConvolverNode | null>(null)
  const startTimeRef   = useRef<number>(0)
  const offsetRef      = useRef<number>(0)
  const toneLoaded     = useRef(false)

  // Lazy-init AudioContext (must be user-triggered)
  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }, [])

  // Build reverb impulse response (simple synthetic IR)
  const buildReverb = useCallback(async (ctx: AudioContext): Promise<ConvolverNode> => {
    const convolver  = ctx.createConvolver()
    const sampleRate = ctx.sampleRate
    const length     = sampleRate * 2.5  // 2.5s reverb tail
    const ir         = ctx.createBuffer(2, length, sampleRate)

    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch)
      for (let i = 0; i < length; i++) {
        // Exponential decay noise — sounds like a small room
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2)
      }
    }

    convolver.buffer = ir
    return convolver
  }, [])

  // Wire up the audio graph
  const buildGraph = useCallback(async () => {
    if (!audioBufferRef.current) return
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    // Stop previous playback
    try { sourceRef.current?.stop() } catch { /* ok */ }

    // Create nodes
    const source  = ctx.createBufferSource()
    source.buffer = audioBufferRef.current
    source.loop   = true

    const gainDry = ctx.createGain()
    const gainWet = ctx.createGain()

    // Use Tone.js-style reverb via ConvolverNode (lazy init)
    if (!reverbRef.current) {
      reverbRef.current = await buildReverb(ctx)
    }

    // Route: source → split to dry and wet paths → destination
    source.connect(gainDry)
    source.connect(reverbRef.current)
    reverbRef.current.connect(gainWet)
    gainDry.connect(ctx.destination)
    gainWet.connect(ctx.destination)

    // Apply A/B mode
    if (abMode === 'dry') {
      gainDry.gain.setValueAtTime(1, ctx.currentTime)
      gainWet.gain.setValueAtTime(0, ctx.currentTime)
    } else {
      gainDry.gain.setValueAtTime(1 - mixLevel, ctx.currentTime)
      gainWet.gain.setValueAtTime(mixLevel,     ctx.currentTime)
    }

    sourceRef.current = source
    gainDryRef.current = gainDry
    gainWetRef.current = gainWet

    source.start(0, offsetRef.current % (audioBufferRef.current.duration))
    startTimeRef.current = ctx.currentTime - (offsetRef.current % (audioBufferRef.current?.duration ?? 1))

    source.onended = () => {
      if (isPlaying) setIsPlaying(false)
    }
  }, [abMode, mixLevel, buildReverb, getCtx, isPlaying])

  // Update gains live when A/B or mix changes (no restart needed)
  useEffect(() => {
    const ctx = audioCtxRef.current
    if (!ctx || !gainDryRef.current || !gainWetRef.current) return

    const t = ctx.currentTime
    if (abMode === 'dry') {
      gainDryRef.current.gain.setTargetAtTime(1,          t, 0.05)
      gainWetRef.current.gain.setTargetAtTime(0,          t, 0.05)
    } else {
      gainDryRef.current.gain.setTargetAtTime(1 - mixLevel, t, 0.05)
      gainWetRef.current.gain.setTargetAtTime(mixLevel,     t, 0.05)
    }
  }, [abMode, mixLevel])

  const handleFileLoad = useCallback(async (file: File) => {
    setError(null)
    setFileName(file.name)

    try {
      const ctx        = getCtx()
      const arrayBuf   = await file.arrayBuffer()
      const audioBuf   = await ctx.decodeAudioData(arrayBuf)
      audioBufferRef.current = audioBuf
      offsetRef.current = 0
      setIsPlaying(false)
    } catch {
      setError('Could not decode audio. Try a WAV or MP3 file.')
    }
  }, [getCtx])

  const togglePlay = useCallback(async () => {
    if (!audioBufferRef.current) return

    if (isPlaying) {
      // Pause: capture offset, stop source
      const ctx = audioCtxRef.current
      if (ctx) {
        offsetRef.current += ctx.currentTime - startTimeRef.current
      }
      try { sourceRef.current?.stop() } catch { /* ok */ }
      setIsPlaying(false)
    } else {
      await buildGraph()
      setIsPlaying(true)
    }
  }, [isPlaying, buildGraph])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileLoad(file)
  }, [handleFileLoad])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileLoad(file)
  }, [handleFileLoad])

  const reverbLabel = spec
    ? `${spec.name} Preview`
    : 'Reverb Preview'

  return (
    <div className="bg-studio-darker px-5 py-4">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Drop zone / file info */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 border-dashed transition-colors cursor-pointer min-w-0 flex-1 max-w-xs ${
            isDragging
              ? 'border-studio-amber bg-studio-amber/5 text-studio-amber'
              : fileName
              ? 'border-studio-border bg-studio-dark text-white'
              : 'border-studio-border bg-studio-dark text-studio-muted hover:border-studio-muted'
          }`}
          onClick={() => document.getElementById('audio-file-input')?.click()}
        >
          <UploadCloud className="w-4 h-4 flex-none" />
          <span className="text-sm truncate">
            {fileName ?? 'Drop audio file to preview'}
          </span>
          <input
            id="audio-file-input"
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          disabled={!audioBufferRef.current}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-studio-mid border border-studio-border text-white text-sm font-medium hover:bg-studio-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPlaying
            ? <><Pause className="w-4 h-4" /> Pause</>
            : <><Play  className="w-4 h-4" /> Play</>
          }
        </button>

        {/* A/B toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-studio-muted">DRY</span>
          <button
            onClick={() => setAbMode(m => m === 'dry' ? 'wet' : 'dry')}
            className="text-studio-amber hover:text-amber-400 transition-colors"
            title={abMode === 'wet' ? 'Switch to Dry' : 'Switch to Wet'}
          >
            {abMode === 'wet'
              ? <ToggleRight className="w-8 h-8" />
              : <ToggleLeft  className="w-8 h-8" />
            }
          </button>
          <span className="text-xs text-studio-muted">WET</span>
        </div>

        {/* Mix slider */}
        {abMode === 'wet' && (
          <div className="flex items-center gap-2 min-w-[120px]">
            <Volume2 className="w-4 h-4 text-studio-muted flex-none" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={mixLevel}
              onChange={(e) => setMixLevel(parseFloat(e.target.value))}
              className="flex-1 accent-amber-500"
              title={`Mix: ${Math.round(mixLevel * 100)}%`}
            />
            <span className="text-xs text-studio-muted w-8 text-right">
              {Math.round(mixLevel * 100)}%
            </span>
          </div>
        )}

        {/* Label */}
        <span className="text-xs text-studio-muted ml-auto hidden sm:block">
          {reverbLabel}
        </span>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-1.5 text-xs text-studio-red">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
