/**
 * Persisted app settings.
 *
 * Uses Capacitor Preferences (native UserDefaults / SharedPreferences) with a
 * localStorage fallback so the same code works in a desktop browser.
 */

import { storageGet, storageSet } from './storage'
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
  const value = await storageGet(SETTINGS_KEY)
  if (!value) return { ...DEFAULT_SETTINGS }
  try {
    return coerce(JSON.parse(value))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await storageSet(SETTINGS_KEY, JSON.stringify(settings))
}
