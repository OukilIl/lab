'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Languages,
  LogOut,
  Monitor,
  Moon,
  RotateCcw,
  Server,
  Settings2,
  Smartphone,
  Sun,
  Trash2,
} from 'lucide-react'

import { useBackend } from '@/lib/data/BackendProvider'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { clearStoredLanguage } from '@/lib/i18n/I18nProvider'
import { LANGUAGES } from '@/lib/i18n/translations'
import { Alert } from '@/components/ui'

type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'labstock.theme'

/** Which confirmation dialog is open, if any. */
type Confirm = null | 'reset' | 'wipe'

export function SettingsScreen() {
  const { settings, resetSettings, backend, invalidate, user, logout, configure } = useBackend()
  const { t, language, setLanguage } = useI18n()

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof localStorage === 'undefined') return 'system'
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  })

  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null)

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  function applyTheme(next: Theme) {
    setTheme(next)
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, next)
    } catch {
      /* non-fatal */
    }
  }

  async function handleReset() {
    setBusy(true)
    clearStoredLanguage()
    try {
      localStorage.removeItem(THEME_KEY)
    } catch {
      /* ignore */
    }
    document.documentElement.removeAttribute('data-theme')
    await resetSettings()
    // No further UI needed — the app returns to onboarding.
  }

  async function handleWipe() {
    if (!backend) return
    setBusy(true)
    const res = await backend.clearAllData()
    setBusy(false)
    setConfirm(null)

    if (res.ok) {
      invalidate()
      setNotice({ tone: 'ok', text: t('resetDone') })
    } else {
      setNotice({ tone: 'danger', text: res.error })
    }
  }

  const isLocal = settings.mode === 'local'

  return (
    <div className="stack stack-4">
      <div className="page-head">
        <h1>{t('settings')}</h1>
        <p>{t('settingsSubtitle')}</p>
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {/* ---- Language ---- */}
      <section className="card">
        <div className="card-head">
          <h2>
            <Languages size={17} style={{ color: 'var(--accent)' }} /> {t('language')}
          </h2>
        </div>
        <div className="card-body">
          <div className="lang-grid">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                className="lang-option"
                data-selected={language === lang.code}
                onClick={() => setLanguage(lang.code)}
                aria-pressed={language === lang.code}
              >
                <span className="native">{lang.native}</span>
                <span className="latin">{lang.label}</span>
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            {t('languageHint')}
          </p>
        </div>
      </section>

      {/* ---- Appearance ---- */}
      <section className="card">
        <div className="card-head">
          <h2>{t('appearance')}</h2>
        </div>
        <div className="card-body">
          <div className="segmented">
            <button data-active={theme === 'light'} onClick={() => applyTheme('light')}>
              <Sun size={15} /> {t('themeLight')}
            </button>
            <button data-active={theme === 'dark'} onClick={() => applyTheme('dark')}>
              <Moon size={15} /> {t('themeDark')}
            </button>
            <button data-active={theme === 'system'} onClick={() => applyTheme('system')}>
              <Monitor size={15} /> {t('themeSystem')}
            </button>
          </div>
        </div>
      </section>

      {/* ---- Connection ---- */}
      <section className="card">
        <div className="card-head">
          <h2>{t('connection')}</h2>
        </div>
        <div className="card-body stack stack-3">
          <div className="setting-row" style={{ borderBottom: 'none', padding: 0 }}>
            <div>
              <div className="setting-label row" style={{ gap: 7 }}>
                {isLocal ? <Smartphone size={15} /> : <Server size={15} />}
                {isLocal ? t('storageLocal') : t('storageServer')}
                {!isLocal && user && (
                  <span className="badge badge-accent">{user.username}</span>
                )}
              </div>
              {!isLocal && settings.serverUrl && (
                <div className="setting-help mono selectable">{settings.serverUrl}</div>
              )}
            </div>
          </div>

          {/* Functions the old top bar used to hold. */}
          <button
            className="btn btn-secondary btn-block"
            onClick={() => void configure({ ...settings, configured: false })}
          >
            <Settings2 size={16} /> {t('changeConnection')}
          </button>

          {!isLocal && user && (
            <button className="btn btn-secondary btn-block" onClick={() => void logout()}>
              <LogOut size={16} /> {t('signOut')}
            </button>
          )}
        </div>
      </section>

      {/* ---- Reset ---- */}
      <section className="card">
        <div className="card-head">
          <h2>
            <AlertTriangle size={17} style={{ color: 'var(--warn)' }} /> {t('dangerZone')}
          </h2>
        </div>
        <div className="card-body stack stack-3">
          <div>
            <div className="setting-label">{t('resetSettings')}</div>
            <p className="setting-help" style={{ marginTop: 4 }}>
              {t('resetSettingsBody')}
            </p>
          </div>
          <button className="btn btn-secondary btn-block" onClick={() => setConfirm('reset')}>
            <RotateCcw size={16} /> {t('resetSettingsButton')}
          </button>

          {/* Wiping records is only offered where the data is actually local;
              a phone must not be able to clear the team's shared server. */}
          {isLocal && (
            <>
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
                <div className="setting-label text-danger">{t('resetEverythingTitle')}</div>
                <p className="setting-help" style={{ marginTop: 4 }}>
                  {t('resetEverythingBody')}
                </p>
              </div>
              <button className="btn btn-danger btn-block" onClick={() => setConfirm('wipe')}>
                <Trash2 size={16} /> {t('resetEverything')}
              </button>
            </>
          )}
        </div>
      </section>

      {/* ---- Confirmations ---- */}
      {confirm && (
        <div
          className="modal-scrim"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setConfirm(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {confirm === 'reset' ? (
              <>
                <h2>
                  <RotateCcw size={18} /> {t('resetConfirmTitle')}
                </h2>
                <p>{t('resetConfirmBody')}</p>
                {isLocal && (
                  <div style={{ marginTop: 12 }}>
                    <Alert tone="info">{t('resetConfirmLocalWarning')}</Alert>
                  </div>
                )}
                <div className="modal-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setConfirm(null)}
                    disabled={busy}
                  >
                    {t('cancel')}
                  </button>
                  <button className="btn btn-primary" onClick={handleReset} disabled={busy}>
                    {busy ? <span className="spinner" /> : null} {t('confirmReset')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-danger">
                  <Trash2 size={18} /> {t('resetEverythingTitle')}
                </h2>
                <p>{t('resetEverythingBody')}</p>
                <div className="modal-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setConfirm(null)}
                    disabled={busy}
                  >
                    {t('cancel')}
                  </button>
                  <button className="btn btn-danger" onClick={handleWipe} disabled={busy}>
                    {busy ? <span className="spinner" /> : null} {t('confirmDelete')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
