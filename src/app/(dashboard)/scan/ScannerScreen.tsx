'use client'

/**
 * Live scanning screen.
 *
 * The camera decodes continuously; a confirmed read fills the form below and
 * the user commits it. A manual capture button remains for labels the live
 * decoder cannot resolve (damaged, curved, or very low contrast).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera,
  CameraOff,
  CircleDot,
  Flashlight,
  PackagePlus,
  ScanLine,
  Sparkles,
} from 'lucide-react'

import { useBackend } from '@/lib/data/BackendProvider'
import { useScanner, type ScanHit } from '@/lib/scanner/useScanner'
import { normalizeServerUrl } from '@/lib/data/remote'
import { Alert } from '@/components/ui'
import type { ParsedBarcode } from '@/core/barcode'

interface Feedback {
  tone: 'ok' | 'danger' | 'warn' | 'info'
  text: string
  missingGtin?: string
}

export function ScannerScreen() {
  const router = useRouter()
  const { backend, settings, invalidate } = useBackend()

  const [gtin, setGtin] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')

  const [lastScan, setLastScan] = useState<ParsedBarcode | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [flash, setFlash] = useState(false)
  const [saving, setSaving] = useState(false)
  const [manualBusy, setManualBusy] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleHit = useCallback(
    (hit: ScanHit) => {
      const { parsed } = hit

      setLastScan(parsed)
      if (parsed.gtin) setGtin(parsed.gtin)
      if (parsed.batch) setBatchNumber(parsed.batch)
      if (parsed.expirationDate) setExpirationDate(parsed.expirationDate)

      setFlash(true)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(false), 400)

      void pulse()

      // Surface parser warnings rather than silently accepting a suspect read:
      // a wrong GTIN books stock against the wrong product.
      if (parsed.warnings.length > 0) {
        setFeedback({ tone: 'warn', text: `${parsed.warnings.join('. ')}. Check the fields below.` })
      } else {
        const label = parsed.format === 'HIBC' ? 'HIBC' : parsed.format === 'GS1' ? 'GS1' : 'barcode'
        setFeedback({ tone: 'ok', text: `${label} decoded. Confirm the details and save.` })
      }
    },
    // `pulse` is stable from the hook; referenced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const { state, videoRef, start, stop, toggleTorch, pulse } = useScanner(handleHit)

  // Start the camera on mount; the hook stops it on unmount and on background.
  useEffect(() => {
    void start()
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Manual capture: send one frame to the server's multi-pass decoder. */
  async function handleManualCapture() {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (settings.mode !== 'remote') {
      setFeedback({
        tone: 'info',
        text: 'Enhanced capture needs a lab server. Hold steady and let the live scanner try again.',
      })
      return
    }
    if (!video || !canvas || !video.videoWidth) {
      setFeedback({ tone: 'danger', text: 'The camera is not ready yet.' })
      return
    }

    setManualBusy(true)
    setFeedback(null)

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95)
    )
    if (!blob) {
      setManualBusy(false)
      setFeedback({ tone: 'danger', text: 'Could not capture a frame.' })
      return
    }

    try {
      const form = new FormData()
      form.append('image', blob, 'capture.jpg')

      const res = await fetch(`${normalizeServerUrl(settings.serverUrl)}/api/decode`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()

      if (!res.ok) {
        setFeedback({ tone: 'danger', text: data?.error ?? 'No barcode found in that frame.' })
      } else {
        handleHit({ parsed: data as ParsedBarcode, symbology: 'server', engine: 'web' })
      }
    } catch {
      setFeedback({ tone: 'danger', text: 'Could not reach the server for enhanced decoding.' })
    } finally {
      setManualBusy(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!backend) return

    setSaving(true)
    setFeedback(null)

    const result = await backend.addBatch({
      gtin: gtin.trim(),
      batchNumber: batchNumber.trim(),
      expirationDate,
      quantity: parseInt(quantity, 10) || 0,
      notes: notes.trim() || null,
    })

    setSaving(false)

    if (!result.ok) {
      setFeedback({
        tone: 'danger',
        text: result.error,
        missingGtin: result.code === 'PRODUCT_NOT_FOUND' ? gtin.trim() : undefined,
      })
      return
    }

    setFeedback({ tone: 'ok', text: `Saved. ${result.data.currentQuantity} units now in this batch.` })
    setBatchNumber('')
    setExpirationDate('')
    setQuantity('1')
    setNotes('')
    setLastScan(null)
    invalidate()
  }

  const scanning = state.active && !state.error

  return (
    <div className="stack stack-4">
      <div className="page-head">
        <h1>
          <ScanLine size={24} style={{ color: 'var(--accent)' }} /> Scan
        </h1>
        <p>Point the camera at a GS1 DataMatrix or HIBC label. It decodes automatically.</p>
      </div>

      <div className="two-col">
        {/* ---- Camera ---- */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="scanner-frame">
            <video ref={videoRef} autoPlay playsInline muted />

            {scanning && (
              <div className="scanner-overlay">
                <div className="scanner-scrim" />
                <div className="reticle" data-state={flash ? 'found' : 'scanning'}>
                  <span className="reticle-corner tl" />
                  <span className="reticle-corner tr" />
                  <span className="reticle-corner bl" />
                  <span className="reticle-corner br" />
                  {!flash && <div className="scan-sweep" />}
                </div>
                <div className="scanner-hint">
                  {flash ? 'Code captured' : 'Searching for a barcode…'}
                </div>
              </div>
            )}

            <div className="scan-flash" data-flash={flash} />

            {state.torchAvailable && scanning && (
              <div className="scanner-controls">
                <button
                  className="scanner-chip"
                  data-on={state.torchOn}
                  onClick={() => void toggleTorch()}
                  aria-label="Toggle flashlight"
                >
                  <Flashlight size={18} />
                </button>
              </div>
            )}

            {!scanning && (
              <div
                className="scanner-overlay"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--bg-sunken)',
                  pointerEvents: 'auto',
                }}
              >
                <div className="empty">
                  <div className="empty-icon">
                    {state.starting ? <span className="spinner" /> : <CameraOff size={20} />}
                  </div>
                  <div className="empty-title">
                    {state.starting ? 'Starting camera' : 'Camera is off'}
                  </div>
                  {state.error && <p className="empty-text">{state.error}</p>}
                  {!state.starting && (
                    <button className="btn btn-primary btn-sm" onClick={() => void start()}>
                      <Camera size={15} /> Start camera
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="card-body stack stack-3">
            <div className="row-between">
              <span className="text-xs text-muted">
                {state.engine === 'mlkit'
                  ? 'On-device scanning (ML Kit)'
                  : state.engine === 'web'
                    ? 'Browser scanning'
                    : 'Camera idle'}
              </span>
              {scanning && (
                <span className="badge badge-ok">
                  <CircleDot size={11} /> Live
                </span>
              )}
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-secondary grow"
                onClick={() => (scanning ? void stop() : void start())}
              >
                {scanning ? <CameraOff size={16} /> : <Camera size={16} />}
                {scanning ? 'Stop' : 'Start'}
              </button>

              {settings.mode === 'remote' && (
                <button
                  className="btn btn-secondary grow"
                  onClick={handleManualCapture}
                  disabled={!scanning || manualBusy}
                  title="Send one frame to the server for a deeper multi-pass decode"
                >
                  {manualBusy ? <span className="spinner" /> : <Sparkles size={16} />}
                  Enhance
                </button>
              )}
            </div>
          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {/* ---- Details ---- */}
        <div className="card">
          <div className="card-head">
            <h2>Batch details</h2>
            {lastScan && (
              <span className="badge badge-accent">{lastScan.format}</span>
            )}
          </div>

          <div className="card-body">
            {feedback && (
              <div style={{ marginBottom: 14 }}>
                <Alert
                  tone={feedback.tone}
                  action={
                    feedback.missingGtin ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() =>
                          router.push(`/products?gtin=${encodeURIComponent(feedback.missingGtin!)}`)
                        }
                      >
                        <PackagePlus size={15} /> Create this product
                      </button>
                    ) : undefined
                  }
                >
                  {feedback.text}
                </Alert>
              </div>
            )}

            <form onSubmit={handleSave}>
              <div className="field">
                <label htmlFor="gtin">GTIN</label>
                <input
                  id="gtin"
                  name="gtin"
                  className="mono"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  value={gtin}
                  onChange={(e) => setGtin(e.target.value)}
                  placeholder="Scan or type"
                />
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="batch">Lot / batch</label>
                  <input
                    id="batch"
                    name="batchNumber"
                    className="mono"
                    autoComplete="off"
                    required
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="expiry">Expires</label>
                  <input
                    id="expiry"
                    name="expirationDate"
                    type="date"
                    required
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="quantity">Quantity received</label>
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="notes">Notes (optional)</label>
                <input
                  id="notes"
                  name="notes"
                  autoComplete="off"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. arrived frozen"
                />
              </div>

              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={saving}>
                {saving ? (
                  <>
                    <span className="spinner" /> Saving
                  </>
                ) : (
                  'Add to inventory'
                )}
              </button>
            </form>

            {lastScan?.raw && (
              <details style={{ marginTop: 14 }}>
                <summary className="text-xs text-muted" style={{ cursor: 'pointer' }}>
                  Raw scan data
                </summary>
                <p
                  className="mono text-xs selectable"
                  style={{
                    marginTop: 8,
                    padding: 10,
                    background: 'var(--bg-sunken)',
                    borderRadius: 'var(--r-sm)',
                    overflowWrap: 'anywhere',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {/* Make the invisible FNC1 separators visible for debugging. */}
                  {lastScan.raw.replace(/\x1d/g, '⟨GS⟩')}
                </p>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
