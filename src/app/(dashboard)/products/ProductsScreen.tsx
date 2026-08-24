'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PackageSearch, Plus, SearchX } from 'lucide-react'

import { useBackend, useBackendData } from '@/lib/data/BackendProvider'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { DEFAULT_FILTERS, filterProducts, hasActiveFilters, type InventoryFilters } from '@/core/filters'
import { exportInventory } from '@/lib/export/share'
import { Alert, EmptyState, SkeletonCard } from '@/components/ui'
import { InventoryToolbar } from '@/components/InventoryToolbar'
import { ProductRow } from '@/components/ProductRow'
import type { ProductWithBatches } from '@/core/types'
import { CreateProductForm } from './CreateProductForm'

export function ProductsScreen() {
  const searchParams = useSearchParams()
  const { revision, invalidate } = useBackend()
  const { t } = useI18n()

  const { data, error, loading } = useBackendData<ProductWithBatches[]>(
    (b) => b.listProducts(),
    [revision]
  )

  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Arriving from the scanner with ?gtin= means "create this product now".
  const [showForm, setShowForm] = useState(Boolean(searchParams.get('gtin')))

  const products = useMemo(() => data ?? [], [data])
  const visible = useMemo(() => filterProducts(products, filters), [products, filters])

  async function handleExport(format: 'csv' | 'pdf') {
    setExporting(true)
    setNotice(null)

    const res = await exportInventory(visible, format, {
      generatedAt: new Date(),
      title: 'LabStock',
      filterSummary: hasActiveFilters(filters)
        ? `${t('filters')}: ${visible.length}/${products.length}`
        : undefined,
    })

    setExporting(false)
    if (!res.ok) setNotice(t('exportFailed'))
  }

  return (
    <div className="stack stack-4">
      <div className="page-head row-between">
        <div>
          <h1>{t('inventory')}</h1>
          <p>{t('inventorySubtitle')}</p>
        </div>
      </div>

      {notice && <Alert tone="danger">{notice}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <InventoryToolbar
        products={products}
        filters={filters}
        onChange={setFilters}
        onExport={handleExport}
        exporting={exporting}
        resultCount={visible.length}
      />

      <button
        className="btn btn-secondary btn-block"
        onClick={() => setShowForm((v) => !v)}
        aria-expanded={showForm}
      >
        <Plus size={17} /> {t('newProduct')}
      </button>

      {showForm && (
        <CreateProductForm
          key={searchParams.get('gtin') ?? 'new'}
          initialGtin={searchParams.get('gtin') ?? ''}
          onCreated={() => {
            invalidate()
            setShowForm(false)
          }}
        />
      )}

      {loading && !data && (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </>
      )}

      {data && products.length === 0 && (
        <div className="card card-pad">
          <EmptyState icon={PackageSearch} title={t('noProducts')}>
            {t('noProductsBody')}
          </EmptyState>
        </div>
      )}

      {data && products.length > 0 && visible.length === 0 && (
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
