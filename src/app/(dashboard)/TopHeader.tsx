'use client'

import { useEffect, useState } from 'react'
import { FlaskConical, LogOut, Moon, Server, Smartphone, Sun } from 'lucide-react'

import { useBackend } from '@/lib/data/BackendProvider'
import { useI18n } from '@/lib/i18n/I18nProvider'

type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'labstock.theme'

export function TopHeader() {
  const { settings, user, logout, configure } = useBackend()
  const { t } = useI18n()

  // Read synchronously on first render rather than in an effect, which would
  // flash the default theme and trigger a cascading render. The initialiser
  // runs on the client only, so `localStorage` is safe to touch here.
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof localStorage === 'undefined') return 'system'
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  })

  // Reflect the stored choice onto the document element.
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  function cycleTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const current = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme
    const next: Theme = current === 'dark' ? 'light' : 'dark'

    setTheme(next)
    localStorage.setItem(THEME_KEY, next)
  }

  const isRemote = settings.mode === 'remote'

  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">
          <FlaskConical size={17} />
        </span>
        Lab<em>Stock</em>
      </div>

      <div className="header-actions">
        <span
          className={`badge ${isRemote ? 'badge-accent' : 'badge-neutral'}`}
          title={isRemote ? `Connected to ${settings.serverUrl}` : 'Data is stored on this device'}
        >
          {isRemote ? <Server size={12} /> : <Smartphone size={12} />}
          <span className="hide-sm">{isRemote ? (user?.username ?? t('storageServer')) : t('storageLocal')}</span>
        </span>

        <button
          className="btn btn-ghost btn-icon"
          onClick={cycleTheme}
          aria-label="Switch between light and dark theme"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <button
          className="btn btn-ghost btn-icon"
          onClick={() =>
            isRemote ? void logout() : void configure({ ...settings, configured: false })
          }
          aria-label={isRemote ? t('signOut') : t('changeConnection')}
          title={isRemote ? t('signOut') : t('changeConnection')}
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  )
}
