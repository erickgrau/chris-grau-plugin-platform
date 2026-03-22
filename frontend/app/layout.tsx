import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chibitek Plugin Studio',
  description: 'Build professional AU/VST plugins by talking to AI. Describe your sound, get a plugin.',
  keywords: ['audio plugin', 'VST', 'AU', 'AI', 'music production', 'plugin builder'],
  openGraph: {
    title: 'Chibitek Plugin Studio',
    description: 'Build audio plugins by talking to AI',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-studio-black font-sans antialiased">
        <div className="relative min-h-screen">
          {children}
        </div>
      </body>
    </html>
  )
}
