'use client'

/**
 * Language context.
 *
 * Sets `lang` and `dir` on <html> so Arabic mirrors the whole layout via CSS
 * logical properties, rather than needing per-component RTL handling.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  TRANSLATIONS,
  detectLanguage,
  isRtl,
  type Language,
  type TranslationKey,
} from './translations'

const LANGUAGE_KEY = 'labstock.language'

interface I18nValue {
  language: Language
  rtl: boolean
  setLanguage: (next: Language) => void
  t: (key: TranslationKey) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function readStoredLanguage(): Language | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const value = localStorage.getItem(LANGUAGE_KEY)
    return value === 'en' || value === 'fr' || value === 'ar' ? value : null
  } catch {
    return null
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Resolve synchronously on first render so the UI never flashes English
  // before switching. Both calls are client-only and safe in an initialiser.
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en'
    return readStoredLanguage() ?? detectLanguage()
  })

  const rtl = isRtl(language)

  // Reflect onto <html> so CSS logical properties and text direction follow.
  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = rtl ? 'rtl' : 'ltr'
  }, [language, rtl])

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    try {
      localStorage.setItem(LANGUAGE_KEY, next)
    } catch {
      // Non-fatal: the choice simply will not persist.
    }
  }, [])

  const t = useCallback(
    (key: TranslationKey) => TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key,
    [language]
  )

  const value = useMemo<I18nValue>(
    () => ({ language, rtl, setLanguage, t }),
    [language, rtl, setLanguage, t]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside an I18nProvider')
  return ctx
}

/** Clear the stored language; used by the settings reset. */
export function clearStoredLanguage(): void {
  try {
    localStorage.removeItem(LANGUAGE_KEY)
  } catch {
    /* ignore */
  }
}
