'use client'

/**
 * Scanning screen.
 *
 * Two tabs rather than a long form: the camera fills the view and decodes
 * continuously, and manual entry is a separate panel. Only one is on screen
 * at a time, so neither requires scrolling on a phone.
 *
 * A successful scan switches to the details tab with the fields prefilled,
 * which is also where a hand-typed entry is completed.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera,
  CameraOff,
  CircleDot,
  Flashlight,
  Keyboard,
  PackagePlus,
  ScanLine,
  Sparkles,
} from 'lucide-react'

import { useBackend } from '@/lib/data/BackendProvider'
import { useScanner, type ScanHit } from '@/lib/scanner/useScanner'
import { normalizeServerUrl } from '@/lib/data/remote'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Alert } from '@/components/ui'
import type { ParsedBarcode } from '@/core/barcode'

type Tab = 'camera' | 'manual'

interface Feedback {
  tone: 'ok' | 'danger' | 'warn' | 'info'
  text: string
  missingGtin?: string
}

export function ScannerScreen() {
  const router = useRouter()
  const { backend, settings, invalidate, revision } = useBackend()
  const { t } = useI18n()

  const [tab, setTab] = useState<Tab>('camera')

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

  /**
   * Whether a product already exists for the current GTIN.
   *
   * `null` while unknown (empty or still checking). Knowing this up front
   * lets one button do the whole job — "Add to inventory" for a known
   * product, "Create product and add to inventory" for a new one — instead of
   * failing after submit and sending the user to another screen.
   */
  const [productExists, setProductExists] = useState<boolean | null>(null)
  const [productName, setProductName] = useState('')

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

      if (parsed.warnings.length > 0) {
        setFeedback({ tone: 'warn', text: parsed.warnings.join('. ') })
      } else {
        const label = parsed.format === 'HIBC' ? 'HIBC' : parsed.format === 'GS1' ? 'GS1' : ''
        setFeedback({ tone: 'ok', text: `${label} ${t('scannedOk')}`.trim() })
      }

      // Move to the details tab so the user confirms and saves. This also
      // releases the camera, which matters for battery and the privacy light.
      setTab('manual')
      void stop()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  )

  const { state, videoRef, start, stop, toggleTorch, pulse } = useScanner(handleHit)

  // Run the camera only while its tab is showing.
  useEffect(() => {
    if (tab === 'camera') void start()
    else void stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  // Look the GTIN up so the submit button can say what it will actually do.
  // Debounced, because this also runs while the user types by hand.
  useEffect(() => {
    const value = gtin.trim()
    if (!backend || !value) {
      setProductExists(null)
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      const res = await backend.getProduct(value)
      if (cancelled) return
      // On a lookup failure, assume it exists: addBatch still reports
      // PRODUCT_NOT_FOUND, so the worst case is the old behaviour rather
      // than silently creating a duplicate product.
      setProductExists(res.ok ? res.data !== null : true)
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [gtin, backend, revision])

  async function handleManualCapture() {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (settings.mode !== 'remote') {
      setFeedback({ tone: 'info', text: t('enhanceNeedsServer') })
      return
    }
    if (!video || !canvas || !video.videoWidth) return

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
      if (!res.ok) setFeedback({ tone: 'danger', text: data?.error ?? t('somethingWrong') })
      else handleHit({ parsed: data as ParsedBarcode, symbology: 'server', engine: 'web' })
    } catch {
      setFeedback({ tone: 'danger', text: t('somethingWrong') })
    } finally {
      setManualBusy(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!backend) return

    setSaving(true)
    setFeedback(null)

    const trimmedGtin = gtin.trim()

    // Unknown GTIN: create the product first so one action completes the whole
    // job, instead of failing and making the user go elsewhere and come back.
    if (productExists === false) {
      const created = await backend.createProduct({
        gtin: trimmedGtin,
        name: productName.trim(),
        targetStock: 100,
        lowStockThresholdPct: 20,
        expirationWarningDays: 30,
      })

      if (!created.ok) {
        setSaving(false)
        setFeedback({ tone: 'danger', text: created.error })
        return
      }
      setProductExists(true)
    }

    const result = await backend.addBatch({
      gtin: trimmedGtin,
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
        missingGtin: result.code === 'PRODUCT_NOT_FOUND' ? trimmedGtin : undefined,
      })
      return
    }

    setFeedback({
      tone: 'ok',
      text: `${t('savedUnits')} ${result.data.currentQuantity} ${t('nowInBatch')}`,
    })
    setBatchNumber('')
    setExpirationDate('')
    setQuantity('1')
    setNotes('')
    setProductName('')
    setLastScan(null)
    invalidate()
  }

  const scanning = state.active && !state.error

  return (
    <div className="stack stack-4">
      <div className="page-head">
        <h1>
          <ScanLine size={24} style={{ color: 'var(--accent)' }} /> {t('scan')}
        </h1>
      </div>

      <div className="segmented" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'camera'}
          data-active={tab === 'camera'}
          onClick={() => setTab('camera')}
        >
          <Camera size={16} /> {t('tabCamera')}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'manual'}
          data-active={tab === 'manual'}
          onClick={() => setTab('manual')}
        >
          <Keyboard size={16} /> {t('tabManual')}
        </button>
      </div>

      {feedback && (
        <Alert
          tone={feedback.tone}
          action={
            // Only a fallback now: the form creates unknown products inline,
            // so this appears solely if the lookup was wrong about existence.
            feedback.missingGtin ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={() =>
                  router.push(`/products?gtin=${encodeURIComponent(feedback.missingGtin!)}`)
                }
              >
                <PackagePlus size={15} /> {t('createThisProduct')}
              </button>
            ) : undefined
          }
        >
          {feedback.text}
        </Alert>
      )}

      {/* ---- Camera ---- */}
      {tab === 'camera' && (
        <div className="card scanner-card" style={{ overflow: 'hidden' }}>
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
                  {flash ? t('codeCaptured') : t('searching')}
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
                className="scanner-overlay scanner-placeholder"
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
                    {state.starting ? t('startingCamera') : t('cameraOff')}
                  </div>
                  {state.error && <p className="empty-text">{state.error}</p>}
                  {!state.starting && (
                    <button className="btn btn-primary btn-sm" onClick={() => void start()}>
                      <Camera size={15} /> {t('startCamera')}
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
                  ? t('onDeviceScanning')
                  : state.engine === 'web'
                    ? t('browserScanning')
                    : t('cameraIdle')}
              </span>
              {scanning && (
                <span className="badge badge-ok">
                  <CircleDot size={11} /> {t('live')}
                </span>
              )}
            </div>

            {settings.mode === 'remote' && (
              <button
                className="btn btn-secondary btn-block"
                onClick={handleManualCapture}
                disabled={!scanning || manualBusy}
              >
                {manualBusy ? <span className="spinner" /> : <Sparkles size={16} />}
                {t('enhance')}
              </button>
            )}
          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      )}

      {/* ---- Manual entry / confirmation ---- */}
      {tab === 'manual' && (
        <div className="card">
          <div className="card-head">
            <h2>{t('batchDetails')}</h2>
            {lastScan && <span className="badge badge-accent">{lastScan.format}</span>}
          </div>

          <div className="card-body">
            <form onSubmit={handleSave}>
              <div className="field">
                <label htmlFor="gtin">{t('gtin')}</label>
                <input
                  id="gtin"
                  name="gtin"
                  className="mono"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  value={gtin}
                  onChange={(e) => setGtin(e.target.value)}
                  placeholder={t('gtinPlaceholder')}
                />
              </div>

              {/* A barcode carries no product name, so ask for one — but only
                  when this GTIN is genuinely new. */}
              {productExists === false && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <Alert tone="info">{t('newProductNotice')}</Alert>
                  </div>
                  <div className="field">
                    <label htmlFor="product-name">{t('productName')}</label>
                    <input
                      id="product-name"
                      name="productName"
                      autoComplete="off"
                      required
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder={t('namePlaceholder')}
                    />
                    <span className="hint">{t('productNameHint')}</span>
                  </div>
                </>
              )}

              <div className="field-row">
                <div className="field">
                  <label htmlFor="batch">{t('lotBatch')}</label>
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
                  <label htmlFor="expiry">{t('expires')}</label>
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
                <label htmlFor="quantity">{t('quantityReceived')}</label>
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
                <label htmlFor="notes">{t('notesOptional')}</label>
                <input
                  id="notes"
                  name="notes"
                  autoComplete="off"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('notesPlaceholder')}
                />
              </div>

              {/* The label states exactly what the button will do, so an
                  unknown GTIN no longer fails after submit. */}
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={saving}>
                {saving ? (
                  <>
                    <span className="spinner" /> {t('saving')}
                  </>
                ) : productExists === false ? (
                  <>
                    <PackagePlus size={18} /> {t('createAndAdd')}
                  </>
                ) : (
                  t('addToInventory')
                )}
              </button>
            </form>

            {lastScan?.raw && (
              <details style={{ marginTop: 14 }}>
                <summary className="text-xs text-muted" style={{ cursor: 'pointer' }}>
                  {t('rawScanData')}
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
                  {lastScan.raw.replace(/\x1d/g, '⟨GS⟩')}
                </p>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
