'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Settings, HelpCircle } from 'lucide-react'
import ChatPanel from '@/components/chat/ChatPanel'
import PluginPreview from '@/components/preview/PluginPreview'
import WebAudioPreview from '@/components/preview/WebAudioPreview'
import KeyboardPreview from '@/components/KeyboardPreview'
import type { DspSpec } from '@/lib/api'

type CompileStatus = 'idle' | 'compiling' | 'ready' | 'error'

export default function StudioPage() {
  const [dspSpec, setDspSpec] = useState<DspSpec | null>(null)
  const [compileStatus, setCompileStatus] = useState<CompileStatus>('idle')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [pluginName, setPluginName] = useState<string>('Untitled Plugin')
  const [previewPlugin, setPreviewPlugin] = useState<{ id: string; name: string } | null>(null)

  const handleDspSpec = useCallback((spec: DspSpec) => {
    setDspSpec(spec)
    setPluginName(spec.name || 'Untitled Plugin')
    setCompileStatus('idle')
    setDownloadUrl(null)
  }, [])

  const handleBuildPlugin = useCallback(async () => {
    if (!dspSpec) return
    setCompileStatus('compiling')
    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: dspSpec }),
      })
      if (!res.ok) throw new Error('Build failed')
      const data = await res.json() as { downloadUrl: string }
      setDownloadUrl(data.downloadUrl)
      setCompileStatus('ready')
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
        />
      )}

      {/* Main split layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Chat panel */}
        <div className="w-[420px] flex-none flex flex-col border-r border-studio-border">
          <ChatPanel
            onDspSpec={handleDspSpec}
            onBuildPlugin={handleBuildPlugin}
            hasDspSpec={!!dspSpec}
            compileStatus={compileStatus}
          />
        </div>

        {/* Right: Preview panels */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Plugin visual preview */}
          <div className="flex-1 overflow-auto p-4">
            <PluginPreview
              spec={dspSpec}
              status={compileStatus}
              downloadUrl={downloadUrl}
              onBuild={handleBuildPlugin}
              onPreview={
                compileStatus === 'ready' && dspSpec
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
