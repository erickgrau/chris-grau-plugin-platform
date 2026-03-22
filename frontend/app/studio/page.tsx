'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, Settings, HelpCircle } from 'lucide-react'
import ChatPanel from '@/components/chat/ChatPanel'
import PluginPreview from '@/components/preview/PluginPreview'
import WebAudioPreview from '@/components/preview/WebAudioPreview'
import KeyboardPreview from '@/components/KeyboardPreview'
import type { DspSpec } from '@/lib/api'

type CompileStatus = 'idle' | 'compiling' | 'ready' | 'error'

interface BuildResult {
  jobId:     string
  pluginId:  string
  status:    'queued' | 'compiling' | 'done' | 'failed'
  progress?: number
  result?:   { downloadUrl: string; pkgUrl: string }
}

export default function StudioPage() {
  const [dspSpec, setDspSpec] = useState<DspSpec | null>(null)
  const [compileStatus, setCompileStatus] = useState<CompileStatus>('idle')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [buildProgress, setBuildProgress] = useState<number>(0)
  const [pluginName, setPluginName] = useState<string>('Untitled Plugin')
  const [previewPlugin, setPreviewPlugin] = useState<{ id: string; name: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const handleDspSpec = useCallback((spec: DspSpec) => {
    setDspSpec(spec)
    setPluginName(spec.name || 'Untitled Plugin')
    setCompileStatus('idle')
    setDownloadUrl(null)
    setBuildProgress(0)
    stopPolling()
  }, [])

  const handleBuildPlugin = useCallback(async () => {
    if (!dspSpec) return
    stopPolling()
    setCompileStatus('compiling')
    setBuildProgress(0)
    setDownloadUrl(null)

    try {
      const res = await fetch('/api/build', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ spec: dspSpec, pluginId: dspSpec.id }),
      })
      if (!res.ok) throw new Error('Build request failed')
      const buildData = (await res.json()) as { jobId: string; pluginId: string }
      const { jobId } = buildData

      // Poll for status every 3 seconds
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/build/${encodeURIComponent(jobId)}`)
          if (!statusRes.ok) return
          const statusData = (await statusRes.json()) as BuildResult

          setBuildProgress(statusData.progress ?? 0)

          if (statusData.status === 'done') {
            stopPolling()
            const url =
              statusData.result?.pkgUrl ||
              statusData.result?.downloadUrl ||
              null
            setDownloadUrl(url)
            setCompileStatus('ready')
            if (url && dspSpec) {
              setPreviewPlugin({ id: dspSpec.id, name: dspSpec.name })
            }
          } else if (statusData.status === 'failed') {
            stopPolling()
            setCompileStatus('error')
          }
        } catch {
          // swallow transient poll errors
        }
      }, 3000)
    } catch {
      setCompileStatus('error')
    }
  }, [dspSpec])

  return (
    <div className="flex flex-col h-screen bg-studio-black overflow-hidden">
      {/* Top bar */}
      <header className="flex-none flex items-center justify-between px-4 h-12 border-b border-studio-border bg-studio-darker">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-studio-muted hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Home</span>
          </Link>
          <span className="text-studio-border">|</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-studio-amber animate-pulse" />
            <span className="text-white text-sm font-medium truncate max-w-48">{pluginName}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg text-studio-muted hover:text-white hover:bg-studio-mid transition-colors">
            <HelpCircle className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg text-studio-muted hover:text-white hover:bg-studio-mid transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Piano keyboard preview modal */}
      {previewPlugin && (
        <KeyboardPreview
          pluginId={previewPlugin.id}
          pluginName={previewPlugin.name}
          isOpen={true}
          onClose={() => setPreviewPlugin(null)}
          mode={compileStatus === 'ready' ? 'real' : 'simulated'}
        />
      )}

      {/* Main split layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left 40%: Chat panel */}
        <div className="w-2/5 flex-none flex flex-col border-r border-studio-border">
          <ChatPanel
            onDspSpec={handleDspSpec}
            onBuildPlugin={handleBuildPlugin}
            hasDspSpec={!!dspSpec}
            compileStatus={compileStatus}
          />
        </div>

        {/* Right 60%: Plugin preview + audio strip */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Plugin visual preview */}
          <div className="flex-1 overflow-auto p-4">
            <PluginPreview
              spec={dspSpec}
              status={compileStatus}
              downloadUrl={downloadUrl}
              onBuild={handleBuildPlugin}
              onPreview={
                dspSpec
                  ? () => setPreviewPlugin({ id: dspSpec.id, name: dspSpec.name })
                  : undefined
              }
            />
          </div>

          {/* Audio preview strip */}
          <div className="flex-none border-t border-studio-border">
            <WebAudioPreview spec={dspSpec} />
          </div>
        </div>
      </div>
    </div>
  )
}
