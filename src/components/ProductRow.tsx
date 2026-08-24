'use client'

/** One product as a tappable card: stock meter, expiry and metadata. */

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { daysUntil, totalUnits } from '@/core/inventory'
import { soonestExpiry } from '@/core/filters'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { STORAGE_TEMP_KEY } from './InventoryToolbar'
import { ExpiryBadge } from './ui'
import type { ProductWithBatches } from '@/core/types'

export function ProductRow({ product }: { product: ProductWithBatches }) {
  const { t } = useI18n()

  const total = totalUnits(product.batches)
  const pct = product.targetStock > 0 ? Math.round((total / product.targetStock) * 100) : 0
  const low = total <= product.targetStock * (product.lowStockThresholdPct / 100)
  const nextExpiry = soonestExpiry(product)

  return (
    <Link href={`/products/detail?gtin=${encodeURIComponent(product.gtin)}`} className="row-link">
      <article className="card card-interactive">
        <div className="card-head">
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 className="truncate">{product.name}</h2>
            <div className="list-row-meta row wrap" style={{ gap: 6 }}>
              <span className="mono">{product.gtin}</span>
              {product.brand && <span className="badge badge-neutral">{product.brand}</span>}
              {product.storageTemp && (
                <span className={`badge badge-storage-${product.storageTemp}`}>
                  {t(STORAGE_TEMP_KEY[product.storageTemp])}
                </span>
              )}
            </div>
          </div>

          <div className="row" style={{ gap: 6 }}>
            <span className={`badge ${low ? 'badge-danger' : 'badge-ok'} numeric`}>
              {total}/{product.targetStock}
            </span>
            <ChevronRight
              size={17}
              className="icon-directional text-muted"
              aria-hidden
            />
          </div>
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

          <div className="row-between text-xs">
            <span className="text-muted">
              {product.supplier ?? ''}
            </span>
            {nextExpiry && <ExpiryBadge days={daysUntil(nextExpiry)} />}
          </div>
        </div>
      </article>
    </Link>
  )
}
