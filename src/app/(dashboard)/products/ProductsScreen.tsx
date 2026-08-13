'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Boxes, Minus, PackageSearch, Trash2 } from 'lucide-react'

import { useBackend, useBackendData } from '@/lib/data/BackendProvider'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { daysUntil } from '@/core/inventory'
import { Alert, EmptyState, ExpiryBadge, SkeletonCard } from '@/components/ui'
import type { ProductWithBatches } from '@/core/types'
import { CreateProductForm } from './CreateProductForm'

export function ProductsScreen() {
  const searchParams = useSearchParams()
  const { backend, revision, invalidate } = useBackend()
  const { t } = useI18n()

  const { data, error, loading } = useBackendData<ProductWithBatches[]>(
    (b) => b.listProducts(),
    [revision]
  )

  const [busyBatch, setBusyBatch] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  async function consume(batchId: string, quantity: number) {
    if (!backend) return
    setBusyBatch(batchId)
    setRowError(null)

    const res = await backend.logUsage(batchId, quantity)
    setBusyBatch(null)

    if (!res.ok) setRowError(res.error)
    else invalidate()
  }

  async function removeBatch(batchId: string) {
    if (!backend) return
    setBusyBatch(batchId)
    const res = await backend.deleteBatch(batchId)
    setBusyBatch(null)
    if (!res.ok) setRowError(res.error)
    else invalidate()
  }

  return (
    <div className="stack stack-4">
      <div className="page-head">
        <h1>{t('inventory')}</h1>
        <p>{t('inventorySubtitle')}</p>
      </div>

      <div className="split-layout">
        <div className="sticky-panel">
          {/* Keyed on the GTIN so a scan-initiated navigation remounts the
              form with the value already populated. */}
          <CreateProductForm
            key={searchParams.get('gtin') ?? 'new'}
            initialGtin={searchParams.get('gtin') ?? ''}
            onCreated={invalidate}
          />
        </div>

        <div className="stack stack-3">
          {rowError && <Alert tone="danger">{rowError}</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}

          {loading && !data && (
            <>
              <SkeletonCard lines={3} />
              <SkeletonCard lines={2} />
            </>
          )}

          {data && data.length === 0 && (
            <div className="card card-pad">
              <EmptyState icon={PackageSearch} title={t('noProducts')}>
                {t('noProductsBody')}
              </EmptyState>
            </div>
          )}

          {data?.map((product) => {
            const total = product.batches.reduce((sum, b) => sum + b.currentQuantity, 0)
            const pct = product.targetStock > 0 ? Math.round((total / product.targetStock) * 100) : 0
            const low = total <= product.targetStock * (product.lowStockThresholdPct / 100)
            const active = product.batches.filter((b) => b.currentQuantity > 0)

            return (
              <section key={product.id} className="card card-interactive">
                <div className="card-head">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <h2 className="truncate">{product.name}</h2>
                    <div className="list-row-meta mono selectable">{product.gtin}</div>
                  </div>
                  <span className={`badge ${low ? 'badge-danger' : 'badge-ok'} numeric`}>
                    {total}/{product.targetStock}
                  </span>
                </div>

                <div className="card-body stack stack-3">
                  <div className="meter" role="presentation">
                    <div
                      className="meter-fill"
                      style={{
                        width: `${Math.max(2, Math.min(pct, 100))}%`,
                        ['--meter-color' as string]: low ? 'var(--danger)' : 'var(--ok)',
                      }}
                    />
                  </div>

                  {active.length === 0 ? (
                    <EmptyState icon={Boxes} title={t('noStock')}>
                      {t('noStockBody')}
                    </EmptyState>
                  ) : (
                    <div className="list">
                      {active.map((batch) => {
                        const days = daysUntil(batch.expirationDate)
                        const busy = busyBatch === batch.id

                        return (
                          <div key={batch.id} className="list-row wrap">
                            <div className="grow" style={{ minWidth: 140 }}>
                              <div className="list-row-title">
                                <span className="mono selectable">{batch.batchNumber}</span>
                              </div>
                              <div className="list-row-meta row" style={{ gap: 7 }}>
                                <ExpiryBadge days={days} />
                                <span className="numeric text-muted">
                                  {batch.expirationDate}
                                </span>
                              </div>
                            </div>

                            <div className="row" style={{ gap: 7 }}>
                              <span className="qty-pill numeric">{batch.currentQuantity}</span>

                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => void consume(batch.id, 1)}
                                disabled={busy || batch.currentQuantity < 1}
                                aria-label={`Use one from batch ${batch.batchNumber}`}
                                title="Record one unit used"
                              >
                                {busy ? <span className="spinner" /> : <Minus size={15} />}
                                {t('useOne')}
                              </button>

                              <button
                                className="btn btn-ghost btn-icon"
                                onClick={() => void removeBatch(batch.id)}
                                disabled={busy}
                                aria-label={`Delete batch ${batch.batchNumber}`}
                                title={t('deleteBatch')}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
