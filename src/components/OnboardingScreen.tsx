'use client'

/** First-run screen: choose on-device storage or a shared LAN server. */

import { useState } from 'react'
import { ArrowRight, FlaskConical, Server, Smartphone } from 'lucide-react'

import { useBackend } from '@/lib/data/BackendProvider'
import { normalizeServerUrl } from '@/lib/data/remote'
import type { BackendMode } from '@/lib/data/types'
import { Alert } from './ui'

export function OnboardingScreen() {
  const { configure } = useBackend()

  const [mode, setMode] = useState<BackendMode>('local')
  const [serverUrl, setServerUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleContinue() {
    setError(null)

    if (mode === 'remote') {
      const normalized = normalizeServerUrl(serverUrl)
      if (!normalized) {
        setError('Enter a valid server address, for example 192.168.1.89:3000')
        return
      }
    }

    setBusy(true)
    const result = await configure({ mode, serverUrl, configured: true })
    setBusy(false)
    if (!result.ok) setError(result.error ?? 'Could not connect')
  }

  return (
    <div className="centered-screen">
      <div className="centered-card">
        <div className="centered-head">
          <div className="glyph">
            <FlaskConical size={26} />
          </div>
          <h1>Welcome to LabStock</h1>
          <p>Choose where your inventory data should live. You can change this later in Settings.</p>
        </div>

        <div className="stack stack-3" style={{ marginBottom: 20 }}>
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
              <h3>On this device</h3>
              <p>
                Everything is stored locally. Works with no network, and nothing leaves the
                device. Best for a single person tracking their own stock.
              </p>
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
              <h3>Shared lab server</h3>
              <p>
                Connect to a LabStock server on your network so the whole team sees the same
                inventory. Requires the server to be running.
              </p>
            </span>
          </button>
        </div>

        {mode === 'remote' && (
          <div className="field">
            <label htmlFor="server-url">Server address</label>
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
            />
            <span className="hint">
              The address shown when you start the server. Both devices must be on the same
              Wi-Fi network.
            </span>
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
              <span className="spinner" /> Connecting
            </>
          ) : (
            <>
              Continue <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
