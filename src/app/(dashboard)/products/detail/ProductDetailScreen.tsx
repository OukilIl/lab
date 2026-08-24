'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Boxes, ChevronRight, History, Minus, Pencil, Trash2 } from 'lucide-react'

import { useBackend, useBackendData } from '@/lib/data/BackendProvider'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { daysUntil, totalUnits } from '@/core/inventory'
import { STORAGE_TEMPS, type ProductWithBatches, type StorageTemp, type UsageLogEntry } from '@/core/types'
import { Alert, EmptyState, ExpiryBadge, SkeletonCard } from '@/components/ui'
import { STORAGE_TEMP_KEY } from '@/components/InventoryToolbar'

export function ProductDetailScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const gtin = params.get('gtin') ?? ''

  const { backend, revision, invalidate } = useBackend()
  const { t } = useI18n()

  const { data: product, error, loading } = useBackendData<ProductWithBatches | null>(
    (b) => b.getProduct(gtin),
    [revision, gtin]
  )
  const { data: usage } = useBackendData<UsageLogEntry[]>((b) => b.recentUsage(200), [revision])

  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (loading && !product) return <SkeletonCard lines={5} />
  if (error) return <Alert tone="danger">{error}</Alert>
  if (!product) {
    return (
      <div className="stack stack-4">
        <BackLink onClick={() => router.push('/products')} label={t('backToInventory')} />
        <Alert tone="danger">{t('somethingWrong')}</Alert>
      </div>
    )
  }

  const total = totalUnits(product.batches)
  const pct = product.targetStock > 0 ? Math.round((total / product.targetStock) * 100) : 0
  const low = total <= product.targetStock * (product.lowStockThresholdPct / 100)
  const active = product.batches.filter((b) => b.currentQuantity > 0)

  // Usage rows for this product's batches only.
  const batchIds = new Set(product.batches.map((b) => b.id))
  const productUsage = (usage ?? []).filter((u) => batchIds.has(u.inventoryBatchId))
  const batchNumberById = new Map(product.batches.map((b) => [b.id, b.batchNumber]))

  async function consume(batchId: string) {
    if (!backend) return
    setBusy(true)
    setRowError(null)
    const res = await backend.logUsage(batchId, 1)
    setBusy(false)
    if (!res.ok) setRowError(res.error)
    else invalidate()
  }

  async function removeBatch(batchId: string) {
    if (!backend) return
    setBusy(true)
    const res = await backend.deleteBatch(batchId)
    setBusy(false)
    if (!res.ok) setRowError(res.error)
    else invalidate()
  }

  async function deleteProduct() {
    if (!backend || !product) return
    setBusy(true)
    const res = await backend.deleteProduct(product.id)
    setBusy(false)
    if (!res.ok) {
      setRowError(res.error)
      setConfirmDelete(false)
      return
    }
    invalidate()
    router.push('/products')
  }

  return (
    <div className="stack stack-4">
      <BackLink onClick={() => router.push('/products')} label={t('backToInventory')} />

      <div className="page-head">
        <h1>{product.name}</h1>
        <p className="mono selectable">{product.gtin}</p>
      </div>

      {rowError && <Alert tone="danger">{rowError}</Alert>}

      {/* ---- Stock summary ---- */}
      <section className="card card-pad stack stack-3">
        <div className="row-between">
          <span className="setting-label">{t('currentStock')}</span>
          <span className={`badge ${low ? 'badge-danger' : 'badge-ok'} numeric`}>
            {total}/{product.targetStock}
          </span>
        </div>
        <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="meter-fill"
            style={{
              width: `${Math.max(2, Math.min(pct, 100))}%`,
              ['--meter-color' as string]: low ? 'var(--danger)' : 'var(--ok)',
            }}
          />
        </div>
      </section>

      {/* ---- Metadata ---- */}
      <section className="card">
        <div className="card-head">
          <h2>{t('productDetails')}</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing((v) => !v)}>
            <Pencil size={15} /> {editing ? t('cancel') : t('editProduct')}
          </button>
        </div>

        <div className="card-body">
          {editing ? (
            <EditProductForm
              product={product}
              onDone={() => {
                setEditing(false)
                invalidate()
              }}
            />
          ) : (
            <div className="meta-grid">
              <Meta label={t('brand')} value={product.brand} />
              <Meta label={t('supplier')} value={product.supplier} />
              <Meta
                label={t('storage')}
                value={product.storageTemp ? t(STORAGE_TEMP_KEY[product.storageTemp]) : null}
              />
              <Meta label={t('targetStock')} value={String(product.targetStock)} />
              <Meta label={t('lowAtPercent')} value={`${product.lowStockThresholdPct}%`} />
              <Meta label={t('expiryWarningDays')} value={`${product.expirationWarningDays}`} />
            </div>
          )}
        </div>
      </section>

      {/* ---- Batches ---- */}
      <section className="card">
        <div className="card-head">
          <h2>
            <Boxes size={17} style={{ color: 'var(--accent)' }} /> {t('batches')}
          </h2>
          {active.length > 0 && <span className="badge badge-neutral numeric">{active.length}</span>}
        </div>
        <div className="card-body">
          {active.length === 0 ? (
            <EmptyState icon={Boxes} title={t('noStock')}>
              {t('noStockBody')}
            </EmptyState>
          ) : (
            <div className="list">
              {active.map((batch) => (
                <div key={batch.id} className="list-row wrap">
                  <div className="grow" style={{ minWidth: 140 }}>
                    <div className="list-row-title mono selectable">{batch.batchNumber}</div>
                    <div className="list-row-meta row" style={{ gap: 7 }}>
                      <ExpiryBadge days={daysUntil(batch.expirationDate)} />
                      <span className="numeric text-muted">{batch.expirationDate}</span>
                    </div>
                    {batch.notes && <div className="list-row-meta">{batch.notes}</div>}
                  </div>

                  <div className="row" style={{ gap: 7 }}>
                    <span className="qty-pill numeric">{batch.currentQuantity}</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => void consume(batch.id)}
                      disabled={busy}
                    >
                      <Minus size={15} /> {t('useOne')}
                    </button>
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => void removeBatch(batch.id)}
                      disabled={busy}
                      aria-label={t('deleteBatch')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---- Usage history ---- */}
      <section className="card">
        <div className="card-head">
          <h2>
            <History size={17} style={{ color: 'var(--text-secondary)' }} /> {t('usageHistory')}
          </h2>
        </div>
        <div className="card-body">
          {productUsage.length === 0 ? (
            <p className="text-sm text-muted">{t('noUsageYet')}</p>
          ) : (
            <div className="list">
              {productUsage.slice(0, 25).map((entry) => (
                <div key={entry.id} className="list-row">
                  <div>
                    <div className="list-row-title">
                      −<span className="numeric">{entry.quantityUsed}</span>{' '}
                      <span className="mono text-sm text-secondary">
                        {batchNumberById.get(entry.inventoryBatchId) ?? ''}
                      </span>
                    </div>
                    <div className="list-row-meta">
                      {new Date(entry.date).toLocaleString()}
                      {entry.userName ? ` · ${t('usedBy')} ${entry.userName}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---- Delete ---- */}
      <button className="btn btn-danger btn-block" onClick={() => setConfirmDelete(true)}>
        <Trash2 size={16} /> {t('deleteProduct')}
      </button>

      {confirmDelete && (
        <div className="modal-scrim" role="dialog" aria-modal="true" onClick={() => !busy && setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-danger">
              <Trash2 size={18} /> {t('deleteProductConfirm')}
            </h2>
            <p>{t('deleteProductBody')}</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
                {t('cancel')}
              </button>
              <button className="btn btn-danger" onClick={() => void deleteProduct()} disabled={busy}>
                {busy ? <span className="spinner" /> : null} {t('confirmDeleteProduct')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="detail-header">
      <button className="back-button" onClick={onClick}>
        <ArrowLeft size={16} className="icon-directional" /> {label}
      </button>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="meta-item">
      <div className="meta-label">{label}</div>
      <div className="meta-value">{value || '—'}</div>
    </div>
  )
}

function EditProductForm({
  product,
  onDone,
}: {
  product: ProductWithBatches
  onDone: () => void
}) {
  const { backend } = useBackend()
  const { t } = useI18n()

  const [name, setName] = useState(product.name)
  const [brand, setBrand] = useState(product.brand ?? '')
  const [supplier, setSupplier] = useState(product.supplier ?? '')
  const [storageTemp, setStorageTemp] = useState<StorageTemp | ''>(product.storageTemp ?? '')
  const [targetStock, setTargetStock] = useState(String(product.targetStock))
  const [thresholdPct, setThresholdPct] = useState(String(product.lowStockThresholdPct))
  const [warningDays, setWarningDays] = useState(String(product.expirationWarningDays))

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!backend) return

    setBusy(true)
    setError(null)

    const res = await backend.updateProduct(product.id, {
      name: name.trim(),
      brand: brand.trim() || null,
      supplier: supplier.trim() || null,
      storageTemp: storageTemp || null,
      targetStock: parseInt(targetStock, 10) || 0,
      lowStockThresholdPct: parseInt(thresholdPct, 10) || 0,
      expirationWarningDays: parseInt(warningDays, 10) || 0,
    })

    setBusy(false)
    if (!res.ok) setError(res.error)
    else onDone()
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{ marginBottom: 14 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <div className="field">
        <label htmlFor="e-name">{t('name')}</label>
        <input id="e-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="e-brand">{t('brand')}</label>
          <input id="e-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="e-supplier">{t('supplier')}</label>
          <input id="e-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>{t('storage')}</label>
        <div className="chip-row">
          {STORAGE_TEMPS.map((temp) => (
            <button
              key={temp}
              type="button"
              className="chip"
              data-selected={storageTemp === temp}
              onClick={() => setStorageTemp(storageTemp === temp ? '' : temp)}
            >
              {t(STORAGE_TEMP_KEY[temp])}
            </button>
          ))}
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="e-target">{t('targetStock')}</label>
          <input
            id="e-target"
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={targetStock}
            onChange={(e) => setTargetStock(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="e-threshold">{t('lowAtPercent')}</label>
          <input
            id="e-threshold"
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
        <label htmlFor="e-warning">{t('expiryWarningDays')}</label>
        <input
          id="e-warning"
          type="number"
          inputMode="numeric"
          min={1}
          max={3650}
          required
          value={warningDays}
          onChange={(e) => setWarningDays(e.target.value)}
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? <span className="spinner" /> : null} {t('saveChanges')}
      </button>
    </form>
  )
}
