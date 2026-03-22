'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Download, Loader2, CheckCircle, XCircle, Package, RotateCcw } from 'lucide-react'
import { formatParamValue, type DspSpec, type DspParam } from '@/lib/api'

interface PluginPreviewProps {
  spec:        DspSpec | null
  status:      'idle' | 'compiling' | 'ready' | 'error'
  downloadUrl: string | null
  onBuild:     () => void
}

// ─── Knob Component ───────────────────────────────────────────────────────────

interface KnobProps {
  param:    DspParam
  value:    number
  onChange: (value: number) => void
  size?:    number
}

function Knob({ param, value, onChange, size = 52 }: KnobProps) {
  const isDragging = useRef(false)
  const startY     = useRef(0)
  const startValue = useRef(0)

  // Map value to rotation angle: -135° to +135°
  const range   = param.max - param.min
  const pct     = (value - param.min) / range
  const angle   = -135 + pct * 270

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current  = true
    startY.current      = e.clientY
    startValue.current  = value

    const onMove = (me: MouseEvent) => {
      if (!isDragging.current) return
      const dy   = startY.current - me.clientY  // up = increase
      const sens = range / 200                   // 200px = full range
      const next = Math.max(param.min, Math.min(param.max, startValue.current + dy * sens))
      onChange(next)
    }

    const onUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',  onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [value, param.min, param.max, range, onChange])

  const strokeWidth = 4
  const radius      = (size - strokeWidth * 2) / 2
  const cx          = size / 2
  const cy          = size / 2

  // SVG arc for value indicator
  const toRad      = (deg: number) => (deg * Math.PI) / 180
  const endAngle   = -135 + pct * 270
  const startAngle = -135

  const polarToXY = (angle: number, r: number) => ({
    x: cx + r * Math.cos(toRad(angle - 90)),
    y: cy + r * Math.sin(toRad(angle - 90)),
  })

  const startPt = polarToXY(startAngle, radius)
  const endPt   = polarToXY(endAngle,   radius)
  const large   = pct > 0.5 ? 1 : 0

  // Dot indicator
  const dotR  = radius - 4
  const dotPt = polarToXY(endAngle, dotR)

  return (
    <div className="knob-container" title={`${param.name}: ${formatParamValue(param, value)}`}>
      <div
        className="knob"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        role="slider"
        aria-label={param.name}
        aria-valuenow={value}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        tabIndex={0}
        onKeyDown={(e) => {
          const step = (param.max - param.min) / 100
          if (e.key === 'ArrowUp')   onChange(Math.min(param.max, value + step))
          if (e.key === 'ArrowDown') onChange(Math.max(param.min, value - step))
        }}
      >
        <svg width={size} height={size} className="absolute inset-0">
          {/* Track */}
          <path
            d={`M ${startPt.x} ${startPt.y} A ${radius} ${radius} 0 ${pct > (270/360) ? 1 : (pct > 0 && endAngle > startAngle ? large : 0)} 1 ${endPt.x} ${endPt.y}`}
            fill="none"
            stroke="#3f3f46"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Value arc */}
          {pct > 0 && (
            <path
              d={`M ${startPt.x} ${startPt.y} A ${radius} ${radius} 0 ${large} 1 ${endPt.x} ${endPt.y}`}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          )}
          {/* Dot */}
          <circle cx={dotPt.x} cy={dotPt.y} r={2.5} fill="#f59e0b" />
        </svg>
      </div>
      <span className="text-xs text-studio-subtle text-center leading-tight max-w-[56px] truncate">
        {param.name}
      </span>
      <span className="text-xs text-studio-muted font-mono">
        {formatParamValue(param, value)}
      </span>
    </div>
  )
}

// ─── Slider Component ─────────────────────────────────────────────────────────

interface SliderProps {
  param:    DspParam
  value:    number
  onChange: (value: number) => void
}

function ParamSlider({ param, value, onChange }: SliderProps) {
  const pct = ((value - param.min) / (param.max - param.min)) * 100

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-studio-subtle w-20 truncate">{param.name}</span>
      <div className="flex-1 relative h-1.5 bg-studio-mid rounded-full">
        <div
          className="absolute left-0 top-0 h-full bg-studio-amber rounded-full"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={param.min}
          max={param.max}
          step={(param.max - param.min) / 1000}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
      <span className="text-xs text-studio-muted font-mono w-20 text-right">
        {formatParamValue(param, value)}
      </span>
    </div>
  )
}

// ─── Plugin Preview ───────────────────────────────────────────────────────────

export default function PluginPreview({ spec, status, downloadUrl, onBuild }: PluginPreviewProps) {
  const [paramValues, setParamValues] = useState<Record<string, number>>({})

  // Initialize param values from spec defaults
  useEffect(() => {
    if (spec) {
      const defaults: Record<string, number> = {}
      spec.params.forEach(p => { defaults[p.id] = p.default })
      setParamValues(defaults)
    }
  }, [spec])

  const handleParamChange = useCallback((id: string, value: number) => {
    setParamValues(prev => ({ ...prev, [id]: value }))
  }, [])

  // Separate knobs and sliders
  const knobs   = spec?.params.filter(p => p.type === 'knob')   ?? []
  const sliders = spec?.params.filter(p => p.type === 'slider') ?? []
  const toggles = spec?.params.filter(p => p.type === 'toggle') ?? []

  if (!spec) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8">
        <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-studio-border flex items-center justify-center mb-4">
          <Package className="w-8 h-8 text-studio-muted" />
        </div>
        <h3 className="text-white font-medium mb-2">Your plugin will appear here</h3>
        <p className="text-studio-muted text-sm max-w-sm">
          Describe your sound in the chat panel. Once the AI designs a plugin, you&apos;ll see its controls here.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Plugin chassis */}
      <div className="studio-panel overflow-hidden">
        {/* Faceplate header */}
        <div className="px-5 py-4 border-b border-studio-border flex items-center justify-between bg-gradient-to-r from-studio-dark to-studio-darker">
          <div className="flex items-center gap-3">
            {/* Power LED */}
            <div className={`led ${status === 'compiling' ? 'led-amber animate-pulse' : status === 'ready' ? 'led-on' : 'led-off'}`} />
            <div>
              <h2 className="text-white font-semibold text-sm tracking-wide uppercase">
                {spec.name}
              </h2>
              <p className="text-studio-muted text-xs capitalize">
                {spec.category} · Chibitek Labs
              </p>
            </div>
          </div>

          {/* Status / actions */}
          <div className="flex items-center gap-2">
            {status === 'compiling' && (
              <div className="flex items-center gap-2 text-studio-amber text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Compiling…</span>
              </div>
            )}
            {status === 'ready' && downloadUrl && (
              <a
                href={downloadUrl}
                download
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-studio-green/10 border border-studio-green/30 text-studio-green text-xs font-medium hover:bg-studio-green/20 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            )}
            {status === 'error' && (
              <button
                onClick={onBuild}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-studio-red/10 border border-studio-red/30 text-studio-red text-xs font-medium hover:bg-studio-red/20 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>
        </div>

        {/* Compile progress bar */}
        {status === 'compiling' && (
          <div className="h-0.5 bg-studio-mid overflow-hidden">
            <div className="h-full bg-studio-amber animate-pulse w-3/4 transition-all duration-1000" />
          </div>
        )}

        {/* Ready badge */}
        {status === 'ready' && (
          <div className="h-0.5 bg-studio-green" />
        )}

        {/* Controls area */}
        <div className="p-6 space-y-6">
          {/* Knobs row */}
          {knobs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px flex-1 bg-studio-border" />
                <span className="text-xs text-studio-muted uppercase tracking-widest px-2">Controls</span>
                <div className="h-px flex-1 bg-studio-border" />
              </div>
              <div className="flex flex-wrap gap-6 justify-center">
                {knobs.map((p) => (
                  <Knob
                    key={p.id}
                    param={p}
                    value={paramValues[p.id] ?? p.default}
                    onChange={(v) => handleParamChange(p.id, v)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sliders */}
          {sliders.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-studio-border" />
                <span className="text-xs text-studio-muted uppercase tracking-widest px-2">Faders</span>
                <div className="h-px flex-1 bg-studio-border" />
              </div>
              <div className="space-y-3">
                {sliders.map((p) => (
                  <ParamSlider
                    key={p.id}
                    param={p}
                    value={paramValues[p.id] ?? p.default}
                    onChange={(v) => handleParamChange(p.id, v)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Toggles */}
          {toggles.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {toggles.map((p) => {
                const on = (paramValues[p.id] ?? p.default) > 0.5
                return (
                  <button
                    key={p.id}
                    onClick={() => handleParamChange(p.id, on ? 0 : 1)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      on
                        ? 'bg-studio-amber/10 border-studio-amber/40 text-studio-amber'
                        : 'bg-studio-dark border-studio-border text-studio-muted hover:border-studio-border'
                    }`}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Description */}
          {spec.description && (
            <div className="text-xs text-studio-muted italic border-t border-studio-border pt-4">
              {spec.description}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-studio-border bg-studio-darker flex items-center justify-between">
          <span className="text-xs text-studio-muted font-mono">v{spec.version}</span>
          <div className="flex items-center gap-3 text-xs text-studio-muted">
            {status === 'ready' && (
              <span className="flex items-center gap-1 text-studio-green">
                <CheckCircle className="w-3 h-3" />
                Build complete
              </span>
            )}
            {status === 'error' && (
              <span className="flex items-center gap-1 text-studio-red">
                <XCircle className="w-3 h-3" />
                Build failed
              </span>
            )}
            {(status === 'idle' || !status) && (
              <span>Preview mode</span>
            )}
          </div>
        </div>
      </div>

      {/* Param count hint */}
      <p className="text-center text-xs text-studio-muted mt-3">
        {spec.params.length} parameter{spec.params.length !== 1 ? 's' : ''} · Drag knobs to adjust · Hit Build Plugin to compile
      </p>
    </div>
  )
}
