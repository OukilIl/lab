'use client'

/** First-run screen: pick a language, then on-device or LAN-server storage. */

import { useState } from 'react'
import { ArrowRight, FlaskConical, Server, Smartphone } from 'lucide-react'

import { useBackend } from '@/lib/data/BackendProvider'
import { normalizeServerUrl } from '@/lib/data/remote'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { LANGUAGES } from '@/lib/i18n/translations'
import type { BackendMode } from '@/lib/data/types'
import { Alert } from './ui'

export function OnboardingScreen() {
  const { configure } = useBackend()
  const { t, language, setLanguage } = useI18n()

  const [mode, setMode] = useState<BackendMode>('local')
  const [serverUrl, setServerUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleContinue() {
    setError(null)

    if (mode === 'remote' && !normalizeServerUrl(serverUrl)) {
      setError(t('serverAddressInvalid'))
      return
    }

    setBusy(true)
    const result = await configure({ mode, serverUrl, configured: true })
    setBusy(false)
    if (!result.ok) setError(result.error ?? t('cannotConnect'))
  }

  return (
    <div className="centered-screen">
      <div className="centered-card">
        <div className="centered-head">
          <div className="glyph">
            <FlaskConical size={26} />
          </div>
          <h1>{t('welcome')}</h1>
          <p>{t('welcomeSubtitle')}</p>
        </div>

        {/* Language first: everything below should already read in the user's
            own language before they make a decision. */}
        <div className="field">
          <label>{t('chooseLanguage')}</label>
          <div className="lang-grid">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
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
        </div>

        <div className="stack stack-3" style={{ margin: '20px 0' }}>
          <button
            type="button"
            className="mode-option"
            data-selected={mode === 'local'}
            onClick={() => setMode('local')}
            aria-pressed={mode === 'local'}
          >
            <span className="mode-icon">
              <Smartphone size={19} />
            </span>
            <span>
              <h3>{t('modeLocalTitle')}</h3>
              <p>{t('modeLocalBody')}</p>
            </span>
          </button>

          <button
            type="button"
            className="mode-option"
            data-selected={mode === 'remote'}
            onClick={() => setMode('remote')}
            aria-pressed={mode === 'remote'}
          >
            <span className="mode-icon">
              <Server size={19} />
            </span>
            <span>
              <h3>{t('modeServerTitle')}</h3>
              <p>{t('modeServerBody')}</p>
            </span>
          </button>
        </div>

        {mode === 'remote' && (
          <div className="field">
            <label htmlFor="server-url">{t('serverAddress')}</label>
            <input
              id="server-url"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="192.168.1.89:3000"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              dir="ltr"
            />
            <span className="hint">{t('serverAddressHint')}</span>
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 14 }}>
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <button className="btn btn-primary btn-block btn-lg" onClick={handleContinue} disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" /> {t('connecting')}
            </>
          ) : (
            <>
              {t('continue')} <ArrowRight size={18} className="icon-directional" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
