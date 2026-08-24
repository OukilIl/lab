'use client'

/** Search, filter, sort and export controls for a product list. */

import { useState } from 'react'
import { ArrowDownUp, Download, FileText, Search, SlidersHorizontal, Table, X } from 'lucide-react'

import { useI18n } from '@/lib/i18n/I18nProvider'
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  distinctValues,
  type InventoryFilters,
  type SortKey,
} from '@/core/filters'
import { STORAGE_TEMPS, type ProductWithBatches, type StorageTemp } from '@/core/types'
import type { TranslationKey } from '@/lib/i18n/translations'

const STOCK_OPTIONS: Array<{ value: InventoryFilters['stock']; key: TranslationKey }> = [
  { value: 'all', key: 'stockAll' },
  { value: 'low', key: 'stockLow' },
  { value: 'out', key: 'stockOut' },
  { value: 'ok', key: 'stockOk' },
]

const EXPIRY_OPTIONS: Array<{ value: InventoryFilters['expiry']; key: TranslationKey }> = [
  { value: 'all', key: 'expiryAll' },
  { value: 'expired', key: 'expiryExpired' },
  { value: 'expiring', key: 'expiryExpiring' },
  { value: 'fresh', key: 'expiryFresh' },
]

const SORT_OPTIONS: Array<{ value: SortKey; key: TranslationKey }> = [
  { value: 'name', key: 'sortName' },
  { value: 'stock', key: 'sortStock' },
  { value: 'expiry', key: 'sortExpiry' },
  { value: 'supplier', key: 'sortSupplier' },
]

export const STORAGE_TEMP_KEY: Record<StorageTemp, TranslationKey> = {
  ambient: 'storageAmbient',
  refrigerated: 'storageRefrigerated',
  frozen: 'storageFrozen',
}

export function InventoryToolbar({
  products,
  filters,
  onChange,
  onExport,
  exporting,
  resultCount,
}: {
  /** Unfiltered list, so the facet menus show every available value. */
  products: ProductWithBatches[]
  filters: InventoryFilters
  onChange: (next: InventoryFilters) => void
  onExport: (format: 'csv' | 'pdf') => void
  exporting: boolean
  resultCount: number
}) {
  const { t } = useI18n()
  const [panelOpen, setPanelOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const activeCount = countActiveFilters(filters)
  const suppliers = distinctValues(products, 'supplier')
  const brands = distinctValues(products, 'brand')

  const set = (patch: Partial<InventoryFilters>) => onChange({ ...filters, ...patch })

  /** Add or remove one value from a multi-select facet. */
  const toggle = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  return (
    <div className="stack stack-3">
      <div className="row" style={{ gap: 8 }}>
        <div className="search-field grow">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            autoCapitalize="none"
            autoCorrect="off"
          />
          {filters.search && (
            <button
              className="search-clear"
              onClick={() => set({ search: '' })}
              aria-label={t('clearFilters')}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <button
          className="btn btn-secondary btn-icon"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          aria-label={t('filters')}
          data-active={activeCount > 0}
        >
          <SlidersHorizontal size={17} />
          {activeCount > 0 && <span className="filter-count numeric">{activeCount}</span>}
        </button>

        <div className="menu-anchor">
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setExportOpen((v) => !v)}
            aria-expanded={exportOpen}
            aria-label={t('export')}
            disabled={exporting || resultCount === 0}
          >
            {exporting ? <span className="spinner" /> : <Download size={17} />}
          </button>

          {exportOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setExportOpen(false)} />
              <div className="menu" role="menu">
                <p className="menu-help">{t('exportBody')}</p>
                <button
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false)
                    onExport('csv')
                  }}
                >
                  <Table size={16} /> {t('exportCsv')}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false)
                    onExport('pdf')
                  }}
                >
                  <FileText size={16} /> {t('exportPdf')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {panelOpen && (
        <div className="card card-pad stack stack-4">
          <FacetRow label={t('stockStatus')}>
            {STOCK_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                selected={filters.stock === o.value}
                onClick={() => set({ stock: o.value })}
              >
                {t(o.key)}
              </Chip>
            ))}
          </FacetRow>

          <FacetRow label={t('expiryStatus')}>
            {EXPIRY_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                selected={filters.expiry === o.value}
                onClick={() => set({ expiry: o.value })}
              >
                {t(o.key)}
              </Chip>
            ))}
          </FacetRow>

          <FacetRow label={t('storage')}>
            {STORAGE_TEMPS.map((temp) => (
              <Chip
                key={temp}
                selected={filters.storageTemps.includes(temp)}
                onClick={() => set({ storageTemps: toggle(filters.storageTemps, temp) })}
              >
                {t(STORAGE_TEMP_KEY[temp])}
              </Chip>
            ))}
          </FacetRow>

          {suppliers.length > 0 && (
            <FacetRow label={t('supplier')}>
              {suppliers.map((s) => (
                <Chip
                  key={s}
                  selected={filters.suppliers.includes(s)}
                  onClick={() => set({ suppliers: toggle(filters.suppliers, s) })}
                >
                  {s}
                </Chip>
              ))}
            </FacetRow>
          )}

          {brands.length > 0 && (
            <FacetRow label={t('brand')}>
              {brands.map((b) => (
                <Chip
                  key={b}
                  selected={filters.brands.includes(b)}
                  onClick={() => set({ brands: toggle(filters.brands, b) })}
                >
                  {b}
                </Chip>
              ))}
            </FacetRow>
          )}

          <FacetRow label={t('sortBy')}>
            {SORT_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                selected={filters.sort === o.value}
                onClick={() =>
                  // Tapping the active sort flips its direction.
                  set(
                    filters.sort === o.value
                      ? { sortDescending: !filters.sortDescending }
                      : { sort: o.value, sortDescending: false }
                  )
                }
              >
                {t(o.key)}
                {filters.sort === o.value && (
                  <ArrowDownUp size={12} style={{ opacity: 0.7, marginInlineStart: 3 }} />
                )}
              </Chip>
            ))}
          </FacetRow>

          <div className="row-between">
            <span className="text-xs text-muted numeric">
              {t('showingCount')} {resultCount}
            </span>
            {activeCount > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })}
              >
                <X size={14} /> {t('clearFilters')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FacetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="facet-label">{label}</div>
      <div className="chip-row">{children}</div>
    </div>
  )
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button className="chip" data-selected={selected} onClick={onClick} aria-pressed={selected}>
      {children}
    </button>
  )
}
