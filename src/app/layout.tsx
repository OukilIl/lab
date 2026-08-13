import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'

import './globals.css'
import { BackendProvider } from '@/lib/data/BackendProvider'
import { I18nProvider } from '@/lib/i18n/I18nProvider'
import { NativeBootstrap } from './NativeBootstrap'

/**
 * Fonts are downloaded at build time and served from the bundle, so the
 * mobile app renders correctly with no network connection.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
  variable: '--font-mono-face',
})

export const metadata: Metadata = {
  title: 'LabStock',
  description: 'Laboratory inventory tracking with GS1 and HIBC barcode scanning',
  applicationName: 'LabStock',
  appleWebApp: {
    capable: true,
    title: 'LabStock',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Prevents the layout shifting when the on-screen keyboard opens, and stops
  // double-tap zoom, which makes the app feel native rather than web.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#060b16' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <NativeBootstrap />
        <I18nProvider>
          <BackendProvider>{children}</BackendProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
