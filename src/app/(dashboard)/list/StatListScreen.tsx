'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, PackageSearch, SearchX } from 'lucide-react'

import { useBackend, useBackendData } from '@/lib/data/BackendProvider'
import { useI18n } from '@/lib/i18n/I18nProvider'
import {
  DEFAULT_FILTERS,
  filterProducts,
  hasActiveFilters,
  type InventoryFilters,
} from '@/core/filters'
import { exportInventory } from '@/lib/export/share'
import { Alert, EmptyState, SkeletonCard } from '@/components/ui'
import { InventoryToolbar } from '@/components/InventoryToolbar'
import { ProductRow } from '@/components/ProductRow'
import type { ProductWithBatches } from '@/core/types'
import type { TranslationKey } from '@/lib/i18n/translations'

type View = 'all' | 'expiring' | 'low'

/** Each dashboard stat maps to a title and the filter that produced it. */
const VIEWS: Record<View, { title: TranslationKey; subtitle: TranslationKey; preset: Partial<InventoryFilters> }> = {
  all: { title: 'allProducts', subtitle: 'allProductsSubtitle', preset: {} },
  expiring: {
    title: 'expiringTitle',
    subtitle: 'expiringSubtitle',
    // Expired items are also "needing attention", so the view sorts by expiry
    // and includes them rather than filtering to strictly-future warnings.
    preset: { sort: 'expiry' },
  },
  low: { title: 'lowStockTitle', subtitle: 'lowStockSubtitle', preset: { stock: 'low', sort: 'stock' } },
}

function isView(value: string | null): value is View {
  return value === 'all' || value === 'expiring' || value === 'low'
}

export function StatListScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const view: View = isView(params.get('view')) ? (params.get('view') as View) : 'all'

  const { revision } = useBackend()
  const { t } = useI18n()

  const { data, error, loading } = useBackendData<ProductWithBatches[]>(
    (b) => b.listProducts(),
    [revision]
  )

  const config = VIEWS[view]
  const [filters, setFilters] = useState<InventoryFilters>({
    ...DEFAULT_FILTERS,
    ...config.preset,
  })
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const products = useMemo(() => data ?? [], [data])

  // The expiring view is defined by each product's own warning window, which
  // is per-product and so cannot be expressed as a single filter value.
  const scoped = useMemo(() => {
    if (view !== 'expiring') return products
    return products.filter((p) =>
      p.batches.some((b) => {
        if (b.currentQuantity <= 0) return false
        const days = Math.round(
          (Date.parse(`${b.expirationDate}T00:00:00Z`) - Date.now()) / 86_400_000
        )
        return days <= p.expirationWarningDays
      })
    )
  }, [products, view])

  const visible = useMemo(() => filterProducts(scoped, filters), [scoped, filters])

  async function handleExport(format: 'csv' | 'pdf') {
    setExporting(true)
    setNotice(null)
    const res = await exportInventory(visible, format, {
      generatedAt: new Date(),
      title: `LabStock — ${t(config.title)}`,
      filterSummary: hasActiveFilters(filters)
        ? `${t('filters')}: ${visible.length}/${scoped.length}`
        : undefined,
    })
    setExporting(false)
    if (!res.ok) setNotice(t('exportFailed'))
  }

  return (
    <div className="stack stack-4">
      <div className="detail-header">
        <button className="back-button" onClick={() => router.push('/')}>
          <ArrowLeft size={16} className="icon-directional" /> {t('navOverview')}
        </button>
      </div>

      <div className="page-head">
        <h1>{t(config.title)}</h1>
        <p>{t(config.subtitle)}</p>
      </div>

      {notice && <Alert tone="danger">{notice}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <InventoryToolbar
        products={scoped}
        filters={filters}
        onChange={setFilters}
        onExport={handleExport}
        exporting={exporting}
        resultCount={visible.length}
      />

      {loading && !data && <SkeletonCard lines={3} />}

      {data && scoped.length === 0 && (
        <div className="card card-pad">
          <EmptyState icon={PackageSearch} title={t('noProducts')}>
            {t('noProductsBody')}
          </EmptyState>
        </div>
      )}

      {data && scoped.length > 0 && visible.length === 0 && (
        <div className="card card-pad">
          <EmptyState icon={SearchX} title={t('noMatches')}>
            {t('noMatchesBody')}
          </EmptyState>
        </div>
      )}

      <div className="stack stack-3">
        {visible.map((product) => (
          <ProductRow key={product.id} product={product} />
        ))}
      </div>
    </div>
  )
}
