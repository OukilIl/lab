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
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Alert, EmptyState, ExpiryBadge, SkeletonCard } from '@/components/ui'
import type { DashboardData } from '@/core/types'

export default function DashboardPage() {
  const { revision } = useBackend()
  const { t } = useI18n()
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
        <h1>{t('overview')}</h1>
        <p>{t('overviewSubtitle')}</p>
      </div>

      {/* Each tile drills into the list behind its number. */}
      <div className="stat-grid">
        <Link href="/list?view=all" className="stat stat-link">
          <div className="stat-label">
            <Layers size={13} /> {t('totalStock')}
          </div>
          <div className="stat-value numeric">
            {totalUnits}
            <span className="stat-unit">{t('units')}</span>
          </div>
        </Link>

        <Link
          href="/list?view=expiring"
          className="stat stat-link"
          data-tone={expiredCount > 0 ? 'danger' : undefined}
        >
          <div className="stat-label">
            <AlertTriangle size={13} /> {t('expiring')}
          </div>
          <div className="stat-value numeric">
            {expiringSoon.length}
            {expiredCount > 0 && (
              <span className="stat-unit" style={{ color: 'var(--danger-text)' }}>
                {expiredCount} {t('expiredCount')}
              </span>
            )}
          </div>
        </Link>

        <Link
          href="/list?view=low"
          className="stat stat-link"
          data-tone={lowStock.length > 0 ? 'warn' : undefined}
        >
          <div className="stat-label">
            <TrendingDown size={13} /> {t('lowStock')}
          </div>
          <div className="stat-value numeric">
            {lowStock.length}
            <span className="stat-unit">{t('of')} {productCount}</span>
          </div>
        </Link>
      </div>

      {allClear && productCount > 0 && (
        <Alert tone="ok">{t('allGood')}</Alert>
      )}

      {productCount === 0 && (
        <div className="card card-pad">
          <EmptyState icon={PackageSearch} title={t('noProducts')}>
            {t('noProductsBody')}
          </EmptyState>
          <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
            <Link href="/products" className="btn btn-primary">
              {t('addProduct')}
            </Link>
            <Link href="/scan" className="btn btn-secondary">
              <ScanLine size={17} /> {t('navScan')}
            </Link>
          </div>
        </div>
      )}

      {productCount > 0 && (
        <div className="two-col">
          <section className="card">
            <div className="card-head">
              <h2>
                <AlertTriangle size={17} style={{ color: 'var(--warn)' }} /> {t('expiringSoon')}
              </h2>
              {expiringSoon.length > 0 && (
                <span className="badge badge-warn numeric">{expiringSoon.length}</span>
              )}
            </div>
            <div className="card-body">
              {expiringSoon.length === 0 ? (
                <EmptyState icon={CheckCircle2} title={t('nothingExpiring')}>
                  {t('nothingExpiringBody')}
                </EmptyState>
              ) : (
                <div className="list">
                  {expiringSoon.slice(0, 8).map((w) => (
                    <Link
                      key={w.batch.id}
                      href={`/products/detail?gtin=${encodeURIComponent(w.product.gtin)}`}
                      className="list-row"
                    >
                      <div className="grow">
                        <div className="list-row-title truncate">{w.product.name}</div>
                        <div className="list-row-meta">
                          {t('lot')} <span className="mono">{w.batch.batchNumber}</span> ·{' '}
                          <span className="numeric">{w.batch.currentQuantity}</span> {t('left')}
                        </div>
                      </div>
                      <ExpiryBadge days={w.daysToExpiry} />
                    </Link>
                  ))}
                  {expiringSoon.length > 8 && (
                    <div className="list-row text-xs text-muted">
                      +{expiringSoon.length - 8} {t('more')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>
                <TrendingDown size={17} style={{ color: 'var(--danger)' }} /> {t('runningLow')}
              </h2>
              {lowStock.length > 0 && (
                <span className="badge badge-danger numeric">{lowStock.length}</span>
              )}
            </div>
            <div className="card-body">
              {lowStock.length === 0 ? (
                <EmptyState icon={CheckCircle2} title={t('stockFine')}>
                  {t('stockFineBody')}
                </EmptyState>
              ) : (
                <div className="stack stack-4">
                  {lowStock.slice(0, 8).map((l) => (
                    <Link
                      key={l.product.id}
                      href={`/products/detail?gtin=${encodeURIComponent(l.product.gtin)}`}
                      className="row-link"
                    >
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
                    </Link>
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
