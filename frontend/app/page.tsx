'use client'

import Link from 'next/link'
import { MessageSquare, Upload, Radio, ArrowRight, Zap, AudioWaveform, Music2 } from 'lucide-react'

const modes = [
  {
    id: 'describe',
    icon: MessageSquare,
    title: 'Describe It',
    subtitle: 'Mode 1',
    description:
      'Tell the AI what you hear in your head. "A warm tape-saturated compressor with a slow attack" becomes a real plugin.',
    href: '/studio',
    accent: 'amber',
    available: true,
  },
  {
    id: 'upload',
    icon: Upload,
    title: 'Upload a Reference',
    subtitle: 'Mode 2',
    description:
      'Drop in a track you love. The AI listens, analyzes the processing chain, and builds you the plugin that created that sound.',
    href: '/studio/upload',
    accent: 'cyan',
    available: false,
  },
  {
    id: 'live',
    icon: Radio,
    title: 'Play Live',
    subtitle: 'Mode 3',
    description:
      'Connect your instrument. Play. The AI hears what you\'re doing and crafts a plugin in real-time to shape your tone.',
    href: '/studio/live',
    accent: 'red',
    available: false,
  },
]

const features = [
  {
    icon: Zap,
    title: 'Instant Compilation',
    description: 'From conversation to compiled AU/VST in under 60 seconds.',
  },
  {
    icon: Music2,
    title: 'Studio-Grade DSP',
    description: 'AI-generated algorithms reviewed and refined by DSP engineers.',
  },
  {
    icon: AudioWaveform,
    title: 'In-Browser Preview',
    description: 'Hear it before you download it. No DAW needed to audition.',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-studio-black">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-studio-border bg-studio-black/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-studio-amber flex items-center justify-center">
              <span className="text-studio-black font-bold text-sm">C</span>
            </div>
            <span className="font-semibold text-white tracking-tight">Chibitek</span>
            <span className="text-studio-muted text-sm">Plugin Studio</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/studio"
              className="px-4 py-2 rounded-lg bg-studio-amber text-studio-black font-semibold text-sm hover:bg-amber-400 transition-colors"
            >
              Open Studio
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-24 px-6 relative overflow-hidden">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `linear-gradient(rgba(63,63,70,0.2) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(63,63,70,0.2) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
        {/* Radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-studio-border bg-studio-darker text-studio-subtle text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-studio-amber animate-pulse" />
            Early Access — Mode 1 available now
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[1.05] mb-6">
            Build audio plugins
            <br />
            <span className="text-studio-amber">by talking to AI</span>
          </h1>

          <p className="text-xl text-studio-subtle max-w-2xl mx-auto mb-10 leading-relaxed">
            No code. No DSP degree. Just describe the sound you hear in your head —
            warm, punchy, silky, aggressive — and get a real AU/VST plugin in under a minute.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/studio"
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-studio-amber text-studio-black font-semibold text-lg hover:bg-amber-400 transition-all hover:shadow-lg hover:shadow-amber-500/20"
            >
              Start building
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <span className="text-studio-muted text-sm">No signup needed to try</span>
          </div>
        </div>
      </section>

      {/* Mode cards */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Three ways to build</h2>
            <p className="text-studio-subtle">Start with words. Level up to reference tracks and live input.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {modes.map((mode) => {
              const Icon = mode.icon
              const accentClasses = {
                amber: {
                  border: 'border-studio-amber/40 hover:border-studio-amber',
                  icon: 'bg-studio-amber/10 text-studio-amber',
                  badge: 'bg-studio-amber text-studio-black',
                  glow: 'hover:shadow-amber-500/10',
                },
                cyan: {
                  border: 'border-studio-cyan/20 hover:border-studio-cyan/50',
                  icon: 'bg-studio-cyan/10 text-studio-cyan',
                  badge: 'bg-studio-cyan/20 text-studio-cyan',
                  glow: 'hover:shadow-cyan-500/10',
                },
                red: {
                  border: 'border-studio-red/20 hover:border-studio-red/50',
                  icon: 'bg-studio-red/10 text-studio-red',
                  badge: 'bg-studio-red/20 text-studio-red',
                  glow: 'hover:shadow-red-500/10',
                },
              }[mode.accent]!

              const CardWrapper = mode.available ? Link : 'div'
              const cardProps = mode.available ? { href: mode.href } : {}

              return (
                <CardWrapper
                  key={mode.id}
                  {...(cardProps as any)}
                  className={`group relative p-6 rounded-2xl border bg-studio-darker transition-all duration-200 hover:shadow-xl ${accentClasses.border} ${accentClasses.glow} ${mode.available ? 'cursor-pointer' : 'cursor-default opacity-70'}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${accentClasses.icon}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${accentClasses.badge}`}>
                        {mode.subtitle}
                      </span>
                      {!mode.available && (
                        <span className="text-studio-muted text-xs">Coming soon</span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-2">{mode.title}</h3>
                  <p className="text-studio-subtle text-sm leading-relaxed">{mode.description}</p>

                  {mode.available && (
                    <div className="mt-4 flex items-center gap-1 text-sm font-medium text-studio-amber opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Open studio</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  )}
                </CardWrapper>
              )
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 border-t border-studio-border">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title} className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-studio-mid border border-studio-border flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-6 h-6 text-studio-amber" />
                  </div>
                  <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-studio-subtle text-sm">{f.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-studio-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span className="text-studio-muted text-sm">© 2024 Chibitek Labs</span>
          <span className="text-studio-muted text-sm">Built for musicians, by musicians</span>
        </div>
      </footer>
    </div>
  )
}
