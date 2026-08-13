/**
 * Persisted app settings.
 *
 * Uses Capacitor Preferences (native UserDefaults / SharedPreferences) with a
 * localStorage fallback so the same code works in a desktop browser.
 */

import { Preferences } from '@capacitor/preferences'
import { DEFAULT_SETTINGS, SETTINGS_KEY, type AppSettings } from './types'

function isBackendMode(value: unknown): value is AppSettings['mode'] {
  return value === 'local' || value === 'remote'
}

function coerce(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const record = raw as Record<string, unknown>
  return {
    mode: isBackendMode(record.mode) ? record.mode : DEFAULT_SETTINGS.mode,
    serverUrl: typeof record.serverUrl === 'string' ? record.serverUrl : '',
    configured: record.configured === true,
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const { value } = await Preferences.get({ key: SETTINGS_KEY })
    if (value) return coerce(JSON.parse(value))
  } catch {
    // Fall through to localStorage.
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const value = localStorage.getItem(SETTINGS_KEY)
      if (value) return coerce(JSON.parse(value))
    }
  } catch {
    /* ignore */
  }

  return { ...DEFAULT_SETTINGS }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const serialized = JSON.stringify(settings)
  try {
    await Preferences.set({ key: SETTINGS_KEY, value: serialized })
    return
  } catch {
    // Fall through to localStorage.
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SETTINGS_KEY, serialized)
    }
  } catch {
    /* ignore */
  }
}
