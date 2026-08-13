'use client'

/**
 * Decides what the user sees before any screen renders: first-run setup,
 * a sign-in prompt for server mode, a connection error, or the app itself.
 *
 * This replaces the old `middleware.ts` redirect. A static export has no
 * server to redirect from, and a cookie-presence check was never a real
 * authorisation boundary anyway — the API enforces that per request.
 */

import { AlertCircle, RefreshCw, Settings } from 'lucide-react'
import type { ReactNode } from 'react'

import { useBackend } from '@/lib/data/BackendProvider'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { LoadingScreen } from './ui'
import { OnboardingScreen } from './OnboardingScreen'
import { LoginScreen } from './LoginScreen'

export function AppGate({ children }: { children: ReactNode }) {
  const { status, error, retry, settings, configure } = useBackend()
  const { t } = useI18n()

  if (status === 'loading') return <LoadingScreen label={t('startingApp')} />
  if (status === 'onboarding') return <OnboardingScreen />
  if (status === 'needs-login') return <LoginScreen />

  if (status === 'error') {
    return (
      <div className="centered-screen">
        <div className="centered-card">
          <div className="centered-head">
            <div
              className="glyph"
              style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', boxShadow: 'none' }}
            >
              <AlertCircle size={26} />
            </div>
            <h1>{t('cannotConnect')}</h1>
            <p>{error ?? t('somethingWrong')}</p>
          </div>

          <div className="stack stack-3">
            <button className="btn btn-primary btn-block" onClick={() => void retry()}>
              <RefreshCw size={17} /> {t('tryAgain')}
            </button>
            <button
              className="btn btn-secondary btn-block"
              onClick={() => void configure({ ...settings, configured: false })}
            >
              <Settings size={17} /> {t('changeConnection')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
