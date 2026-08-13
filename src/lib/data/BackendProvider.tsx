'use client'

/**
 * Supplies the active `DataBackend` to the app and owns mode switching.
 *
 * Every screen reads data through `useBackend()`, so neither the components
 * nor the hooks know whether they are talking to on-device SQLite or a LAN
 * server.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { LocalBackend } from './local'
import { RemoteBackend } from './remote'
import { loadSettings, saveSettings } from './settings'
import { DEFAULT_SETTINGS, type AppSettings, type DataBackend, type SessionUser } from './types'

type Status = 'loading' | 'onboarding' | 'needs-login' | 'ready' | 'error'

interface BackendContextValue {
  status: Status
  settings: AppSettings
  backend: DataBackend | null
  user: SessionUser | null
  error: string | null
  /** Bumped after any mutation so screens can refetch. */
  revision: number

  configure(next: AppSettings): Promise<{ ok: boolean; error?: string }>
  login(username: string, password: string): Promise<{ ok: boolean; error?: string }>
  logout(): Promise<void>
  retry(): Promise<void>
  invalidate(): void
}

const BackendContext = createContext<BackendContextValue | null>(null)

export function BackendProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  // The backend lives in state, not a ref: it is rendered (passed through
  // context), so a ref would be read during render and could miss updates.
  const [backend, setBackend] = useState<DataBackend | null>(null)

  const bringUp = useCallback(async (next: AppSettings): Promise<{ ok: boolean; error?: string }> => {
    setStatus('loading')
    setError(null)

    const created: DataBackend =
      next.mode === 'local' ? new LocalBackend() : new RemoteBackend(next.serverUrl)

    const res = await created.init()
    if (!res.ok) {
      setBackend(null)
      setError(res.error)
      setStatus('error')
      return { ok: false, error: res.error }
    }

    setBackend(created)

    if (next.mode === 'remote') {
      const current = await created.getCurrentUser()
      setUser(current)
      setStatus(current ? 'ready' : 'needs-login')
    } else {
      setUser(null)
      setStatus('ready')
    }

    setRevision((n) => n + 1)
    return { ok: true }
  }, [])

  // Initial boot.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const stored = await loadSettings()
      if (cancelled) return

      setSettings(stored)
      if (!stored.configured) {
        setStatus('onboarding')
        return
      }
      await bringUp(stored)
    })()

    return () => {
      cancelled = true
    }
  }, [bringUp])

  const configure = useCallback(
    async (next: AppSettings) => {
      const result = await bringUp(next)
      if (result.ok) {
        const persisted = { ...next, configured: true }
        setSettings(persisted)
        await saveSettings(persisted)
      }
      return result
    },
    [bringUp]
  )

  const login = useCallback(
    async (username: string, password: string) => {
      if (!backend) return { ok: false, error: 'No connection to a server' }

      const res = await backend.login(username, password)
      if (!res.ok) return { ok: false, error: res.error }

      setUser(res.data)
      setStatus('ready')
      setRevision((n) => n + 1)
      return { ok: true }
    },
    [backend]
  )

  const logout = useCallback(async () => {
    if (backend) await backend.logout()
    setUser(null)
    if (settings.mode === 'remote') setStatus('needs-login')
  }, [backend, settings.mode])

  const retry = useCallback(async () => {
    await bringUp(settings)
  }, [bringUp, settings])

  const invalidate = useCallback(() => setRevision((n) => n + 1), [])

  const value = useMemo<BackendContextValue>(
    () => ({
      status,
      settings,
      backend,
      user,
      error,
      revision,
      configure,
      login,
      logout,
      retry,
      invalidate,
    }),
    [status, settings, backend, user, error, revision, configure, login, logout, retry, invalidate]
  )

  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>
}

export function useBackend(): BackendContextValue {
  const ctx = useContext(BackendContext)
  if (!ctx) throw new Error('useBackend must be used inside a BackendProvider')
  return ctx
}

/**
 * Fetch helper bound to the active backend.
 *
 * Refetches whenever the backend's revision changes, so any mutation that
 * calls `invalidate()` refreshes every open screen.
 */
export function useBackendData<T>(
  fetcher: (backend: DataBackend) => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
  deps: unknown[] = []
): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const { backend, revision, status } = useBackend()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [localRevision, setLocalRevision] = useState(0)

  // Keep the latest fetcher without making it a reactive dependency.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (!backend || status !== 'ready') return

    let cancelled = false
    setLoading(true)

    fetcherRef
      .current(backend)
      .then((res) => {
        if (cancelled) return
        if (res.ok) {
          setData(res.data)
          setError(null)
        } else {
          setError(res.error)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, status, revision, localRevision, ...deps])

  const reload = useCallback(() => setLocalRevision((n) => n + 1), [])

  return { data, error, loading, reload }
}
