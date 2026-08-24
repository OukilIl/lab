'use client'

import { useState } from 'react'
import { Plus, ScanLine } from 'lucide-react'

import { useBackend } from '@/lib/data/BackendProvider'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Alert } from '@/components/ui'
import { ScanModal } from '@/components/ScanModal'
import { STORAGE_TEMP_KEY } from '@/components/InventoryToolbar'
import { STORAGE_TEMPS, type StorageTemp } from '@/core/types'

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
  const { t } = useI18n()

  const [gtin, setGtin] = useState(initialGtin)
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [supplier, setSupplier] = useState('')
  const [storageTemp, setStorageTemp] = useState<StorageTemp | ''>('')
  const [targetStock, setTargetStock] = useState('100')
  const [thresholdPct, setThresholdPct] = useState('20')
  const [warningDays, setWarningDays] = useState('30')

  const [scannerOpen, setScannerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger' | 'warn'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!backend) return

    setBusy(true)
    setMessage(null)

    const result = await backend.createProduct({
      gtin: gtin.trim(),
      name: name.trim(),
      brand: brand.trim() || null,
      supplier: supplier.trim() || null,
      storageTemp: storageTemp || null,
      targetStock: parseInt(targetStock, 10) || 0,
      lowStockThresholdPct: parseInt(thresholdPct, 10) || 0,
      expirationWarningDays: parseInt(warningDays, 10) || 0,
    })

    setBusy(false)

    if (!result.ok) {
      setMessage({ tone: 'danger', text: result.error })
      return
    }

    setMessage({ tone: 'ok', text: `"${result.data.name}" ${t('added')}` })
    setGtin('')
    setName('')
    setBrand('')
    setSupplier('')
    setStorageTemp('')
    onCreated()
  }

  return (
    <>
      {scannerOpen && (
        <ScanModal
          onClose={() => setScannerOpen(false)}
          onDetect={(hit) => {
            if (hit.parsed.gtin) {
              setGtin(hit.parsed.gtin)
              // Surface a bad check digit rather than letting a misread
              // silently become a new product.
              const suspect = hit.parsed.warnings.filter((w) => w.includes('check digit'))
              setMessage(
                suspect.length > 0 ? { tone: 'warn', text: suspect.join('. ') } : null
              )
            } else {
              setMessage({ tone: 'warn', text: hit.parsed.raw })
            }
          }}
        />
      )}

      <div className="card">
        <div className="card-head">
          <h2>
            <Plus size={17} style={{ color: 'var(--accent)' }} /> {t('newProduct')}
          </h2>
        </div>

        <div className="card-body">
          {message && (
            <div style={{ marginBottom: 14 }}>
              <Alert tone={message.tone}>{message.text}</Alert>
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ marginBottom: 16 }}
            onClick={() => setScannerOpen(true)}
          >
            <ScanLine size={17} /> {t('scanBarcode')}
          </button>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="p-gtin">{t('gtin')}</label>
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
              <span className="hint">{t('gtinHint')}</span>
            </div>

            <div className="field">
              <label htmlFor="p-name">{t('name')}</label>
              <input
                id="p-name"
                autoComplete="off"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="p-brand">
                  {t('brand')} <span className="text-muted">({t('optional')})</span>
                </label>
                <input
                  id="p-brand"
                  autoComplete="off"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="p-supplier">
                  {t('supplier')} <span className="text-muted">({t('optional')})</span>
                </label>
                <input
                  id="p-supplier"
                  autoComplete="off"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>
                {t('storage')} <span className="text-muted">({t('optional')})</span>
              </label>
              <div className="chip-row">
                {STORAGE_TEMPS.map((temp) => (
                  <button
                    key={temp}
                    type="button"
                    className="chip"
                    data-selected={storageTemp === temp}
                    onClick={() => setStorageTemp(storageTemp === temp ? '' : temp)}
                    aria-pressed={storageTemp === temp}
                  >
                    {t(STORAGE_TEMP_KEY[temp])}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="p-target">{t('targetStock')}</label>
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
                <label htmlFor="p-threshold">{t('lowAtPercent')}</label>
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
              <label htmlFor="p-warning">{t('expiryWarningDays')}</label>
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
              <span className="hint">{t('expiryWarningHint')}</span>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" /> {t('adding')}
                </>
              ) : (
                <>
                  <Plus size={17} /> {t('addProduct')}
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
