'use client'

/**
 * Native-platform setup that must run once on the client.
 *
 * Renders nothing; it only adjusts document-level state that native WebViews
 * need (status bar styling, a class hook for native-only CSS).
 */

import { useEffect } from 'react'

export function NativeBootstrap() {
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const { Capacitor } = await import('@capacitor/core')
      if (cancelled || !Capacitor.isNativePlatform()) return

      document.body.classList.add('is-native')

      // Let content sit under the status bar so `viewport-fit=cover` and the
      // safe-area insets in CSS do the layout work.
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        await StatusBar.setOverlaysWebView({ overlay: false })
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        await StatusBar.setStyle({ style: prefersDark ? Style.Dark : Style.Light })
      } catch {
        // Not fatal — the plugin is absent on some platforms.
      }

      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide()
      } catch {
        /* ignore */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
