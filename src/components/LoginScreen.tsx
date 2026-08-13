'use client'

/** Sign-in for server mode. On-device mode never reaches this screen. */

import { useEffect, useState } from 'react'
import { LogIn, Settings, ShieldCheck } from 'lucide-react'

import { useBackend } from '@/lib/data/BackendProvider'
import { normalizeServerUrl } from '@/lib/data/remote'
import { Alert } from './ui'

export function LoginScreen() {
  const { login, settings, configure } = useBackend()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  const serverOrigin = normalizeServerUrl(settings.serverUrl)

  // Ask the server whether it still needs its first account, so a fresh
  // install offers "create administrator" instead of a login that cannot work.
  useEffect(() => {
    let cancelled = false
    if (!serverOrigin) return

    fetch(`${serverOrigin}/api/auth/setup`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { needsSetup?: boolean } | null) => {
        if (!cancelled && data) setNeedsSetup(Boolean(data.needsSetup))
      })
      .catch(() => {
        if (!cancelled) setNeedsSetup(null)
      })

    return () => {
      cancelled = true
    }
  }, [serverOrigin])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    if (needsSetup) {
      try {
        const res = await fetch(`${serverOrigin}/api/auth/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data?.error ?? 'Could not create the account')
          setBusy(false)
          return
        }
        // The account exists now; sign in through the backend so the token is
        // stored the same way as any other session.
      } catch {
        setError('Could not reach the server')
        setBusy(false)
        return
      }
    }

    const result = await login(username, password)
    setBusy(false)
    if (!result.ok) setError(result.error ?? 'Sign-in failed')
  }

  const creating = needsSetup === true

  return (
    <div className="centered-screen">
      <div className="centered-card">
        <div className="centered-head">
          <div className="glyph">{creating ? <ShieldCheck size={26} /> : <LogIn size={26} />}</div>
          <h1>{creating ? 'Create administrator' : 'Sign in'}</h1>
          <p>
            {creating
              ? 'This server has no accounts yet. Create the first administrator account.'
              : `Connected to ${serverOrigin || 'the lab server'}`}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={creating ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {creating && <span className="hint">At least 8 characters.</span>}
          </div>

          {error && (
            <div style={{ marginBottom: 14 }}>
              <Alert tone="danger">{error}</Alert>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" /> {creating ? 'Creating' : 'Signing in'}
              </>
            ) : creating ? (
              <>
                <ShieldCheck size={18} /> Create account
              </>
            ) : (
              <>
                <LogIn size={18} /> Sign in
              </>
            )}
          </button>
        </form>

        <button
          className="btn btn-ghost btn-block btn-sm"
          style={{ marginTop: 12 }}
          onClick={() => void configure({ ...settings, configured: false })}
        >
          <Settings size={15} /> Change connection settings
        </button>
      </div>
    </div>
  )
}
