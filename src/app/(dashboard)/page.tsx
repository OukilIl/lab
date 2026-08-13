'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  PackageSearch,
  ScanLine,
  TrendingDown,
} from 'lucide-react'

import { useBackend, useBackendData } from '@/lib/data/BackendProvider'
import { Alert, EmptyState, ExpiryBadge, SkeletonCard } from '@/components/ui'
import type { DashboardData } from '@/core/types'

export default function DashboardPage() {
  const { revision } = useBackend()
  const { data, error, loading } = useBackendData<DashboardData>(
    (backend) => backend.getDashboard(),
    [revision]
  )

  if (loading && !data) {
    return (
      <div className="stack stack-4">
        <div className="stat-grid">
          <div className="skeleton" style={{ height: 92 }} />
          <div className="skeleton" style={{ height: 92 }} />
          <div className="skeleton" style={{ height: 92 }} />
        </div>
        <div className="two-col">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (error) return <Alert tone="danger">{error}</Alert>
  if (!data) return null

  const { totalUnits, productCount, expiringSoon, lowStock, expiredCount } = data
  const allClear = expiringSoon.length === 0 && lowStock.length === 0

  return (
    <div className="stack stack-4">
      <div className="page-head">
        <h1>Overview</h1>
        <p>Stock levels and anything that needs attention today.</p>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">
            <Layers size={13} /> Total stock
          </div>
          <div className="stat-value numeric">
            {totalUnits}
            <span className="stat-unit">units</span>
          </div>
        </div>

        <div className="stat" data-tone={expiredCount > 0 ? 'danger' : undefined}>
          <div className="stat-label">
            <AlertTriangle size={13} /> Expiring
          </div>
          <div className="stat-value numeric">
            {expiringSoon.length}
            {expiredCount > 0 && (
              <span className="stat-unit" style={{ color: 'var(--danger-text)' }}>
                {expiredCount} expired
              </span>
            )}
          </div>
        </div>

        <div className="stat" data-tone={lowStock.length > 0 ? 'warn' : undefined}>
          <div className="stat-label">
            <TrendingDown size={13} /> Low stock
          </div>
          <div className="stat-value numeric">
            {lowStock.length}
            <span className="stat-unit">of {productCount}</span>
          </div>
        </div>
      </div>

      {allClear && productCount > 0 && (
        <Alert tone="ok">Everything is in good shape — no expiring batches and no low stock.</Alert>
      )}

      {productCount === 0 && (
        <div className="card card-pad">
          <EmptyState icon={PackageSearch} title="No products yet">
            Add your first product, then scan its barcode to start tracking stock.
          </EmptyState>
          <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
            <Link href="/products" className="btn btn-primary">
              Add a product
            </Link>
            <Link href="/scan" className="btn btn-secondary">
              <ScanLine size={17} /> Scan
            </Link>
          </div>
        </div>
      )}

      {productCount > 0 && (
        <div className="two-col">
          <section className="card">
            <div className="card-head">
              <h2>
                <AlertTriangle size={17} style={{ color: 'var(--warn)' }} /> Expiring soon
              </h2>
              {expiringSoon.length > 0 && (
                <span className="badge badge-warn numeric">{expiringSoon.length}</span>
              )}
            </div>
            <div className="card-body">
              {expiringSoon.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nothing expiring">
                  No batch is within its expiry warning window.
                </EmptyState>
              ) : (
                <div className="list">
                  {expiringSoon.slice(0, 8).map((w) => (
                    <div key={w.batch.id} className="list-row">
                      <div className="grow">
                        <div className="list-row-title truncate">{w.product.name}</div>
                        <div className="list-row-meta">
                          Lot <span className="mono selectable">{w.batch.batchNumber}</span> ·{' '}
                          <span className="numeric">{w.batch.currentQuantity}</span> left
                        </div>
                      </div>
                      <ExpiryBadge days={w.daysToExpiry} />
                    </div>
                  ))}
                  {expiringSoon.length > 8 && (
                    <div className="list-row text-xs text-muted">
                      +{expiringSoon.length - 8} more
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>
                <TrendingDown size={17} style={{ color: 'var(--danger)' }} /> Running low
              </h2>
              {lowStock.length > 0 && (
                <span className="badge badge-danger numeric">{lowStock.length}</span>
              )}
            </div>
            <div className="card-body">
              {lowStock.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Stock levels are fine">
                  Every product is above its low-stock threshold.
                </EmptyState>
              ) : (
                <div className="stack stack-4">
                  {lowStock.slice(0, 8).map((l) => (
                    <div key={l.product.id}>
                      <div className="row-between" style={{ marginBottom: 6 }}>
                        <span className="list-row-title truncate">{l.product.name}</span>
                        <span className="text-sm numeric" style={{ color: 'var(--danger-text)', fontWeight: 620 }}>
                          {l.current}/{l.product.targetStock}
                        </span>
                      </div>
                      <div
                        className="meter"
                        role="progressbar"
                        aria-valuenow={l.percentage}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${l.product.name} stock level`}
                      >
                        <div
                          className="meter-fill"
                          style={{
                            width: `${Math.max(2, Math.min(l.percentage, 100))}%`,
                            // Red only when critically low; amber otherwise.
                            ['--meter-color' as string]:
                              l.percentage <= 10 ? 'var(--danger)' : 'var(--warn)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
