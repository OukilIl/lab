'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

import { useBackend } from '@/lib/data/BackendProvider'
import { Alert } from '@/components/ui'

/**
 * The caller passes `key={initialGtin}`, so arriving from the scanner with a
 * new ?gtin= remounts this form with the value already in state. That avoids
 * syncing a prop into state from an effect, which causes a cascading render.
 */
export function CreateProductForm({
  initialGtin,
  onCreated,
}: {
  initialGtin: string
  onCreated: () => void
}) {
  const { backend } = useBackend()

  const [gtin, setGtin] = useState(initialGtin)
  const [name, setName] = useState('')
  const [targetStock, setTargetStock] = useState('100')
  const [thresholdPct, setThresholdPct] = useState('20')
  const [warningDays, setWarningDays] = useState('30')

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!backend) return

    setBusy(true)
    setMessage(null)

    const result = await backend.createProduct({
      gtin: gtin.trim(),
      name: name.trim(),
      targetStock: parseInt(targetStock, 10) || 0,
      lowStockThresholdPct: parseInt(thresholdPct, 10) || 0,
      expirationWarningDays: parseInt(warningDays, 10) || 0,
    })

    setBusy(false)

    if (!result.ok) {
      setMessage({ tone: 'danger', text: result.error })
      return
    }

    setMessage({ tone: 'ok', text: `"${result.data.name}" added.` })
    setGtin('')
    setName('')
    onCreated()
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>
          <Plus size={17} style={{ color: 'var(--accent)' }} /> New product
        </h2>
      </div>

      <div className="card-body">
        {message && (
          <div style={{ marginBottom: 14 }}>
            <Alert tone={message.tone}>{message.text}</Alert>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="p-gtin">GTIN</label>
            <input
              id="p-gtin"
              className="mono"
              inputMode="numeric"
              autoComplete="off"
              required
              value={gtin}
              onChange={(e) => setGtin(e.target.value)}
              placeholder="03453120000011"
            />
            <span className="hint">The barcode number identifying this product.</span>
          </div>

          <div className="field">
            <label htmlFor="p-name">Name</label>
            <input
              id="p-name"
              autoComplete="off"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sterile pipette tips 200µL"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="p-target">Target stock</label>
              <input
                id="p-target"
                type="number"
                inputMode="numeric"
                min={1}
                required
                value={targetStock}
                onChange={(e) => setTargetStock(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="p-threshold">Low at %</label>
              <input
                id="p-threshold"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                required
                value={thresholdPct}
                onChange={(e) => setThresholdPct(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="p-warning">Expiry warning (days)</label>
            <input
              id="p-warning"
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              required
              value={warningDays}
              onChange={(e) => setWarningDays(e.target.value)}
            />
            <span className="hint">Flag batches this many days before they expire.</span>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" /> Adding
              </>
            ) : (
              <>
                <Plus size={17} /> Add product
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
