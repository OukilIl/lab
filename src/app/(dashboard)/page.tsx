import prisma from '@/lib/db'
import { AlertTriangle, TrendingDown, PackageOpen, LayoutGrid } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const products = await prisma.product.findMany({
    include: { inventoryBatches: true }
  })

  let totalItems = 0;
  const warnings: any[] = []
  const lowStock: any[] = []

  products.forEach(product => {
    let productTotal = 0;
    product.inventoryBatches.forEach(batch => {
      productTotal += batch.currentQuantity;
      totalItems += batch.currentQuantity;

      if (batch.expirationDate && batch.currentQuantity > 0) {
        const daysToExpiry = Math.ceil((batch.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        if (daysToExpiry <= product.expirationWarningDays) {
          warnings.push({ product, batch, daysToExpiry })
        }
      }
    })

    if (productTotal < product.targetStock * (product.lowStockThresholdPct / 100)) {
      lowStock.push({ product, current: productTotal })
    }
  })

  // Sort warnings by urgency
  warnings.sort((a, b) => a.daysToExpiry - b.daysToExpiry)

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2.5rem' }}>
        
        <div className="surface-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem 2rem' }}>
          <div style={{ backgroundColor: 'var(--accent-blue-light)', padding: '1rem', borderRadius: '50%' }}>
            <LayoutGrid size={28} color="var(--accent-blue)" />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Inventory</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{totalItems} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>Units</span></div>
          </div>
        </div>

      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
        
        {/* Spoilage Warnings */}
        <div className="surface-card">
          <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem' }}>
            <AlertTriangle size={20} color="var(--status-warning)" /> Action Required
          </h2>
          {warnings.length === 0 ? (
             <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', padding: '1rem 0' }}>All batches are healthy.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {warnings.map((w, i) => (
                <div key={i} className="data-row">
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{w.product.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Batch: {w.batch.batchNumber}</div>
                  </div>
                  <div className={`badge ${w.daysToExpiry < 0 ? 'badge-danger' : 'badge-warning'}`}>
                    {w.daysToExpiry < 0 ? `Expired ${Math.abs(w.daysToExpiry)}d ago` : `Expires in ${w.daysToExpiry}d`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock Alerts */}
        <div className="surface-card">
          <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem' }}>
            <TrendingDown size={20} color="var(--status-danger)" /> Low Stock Alerts
          </h2>
          {lowStock.length === 0 ? (
             <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', padding: '1rem 0' }}>Stock levels are optimal.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {lowStock.map((l, i) => {
                const percentage = Math.round((l.current / l.product.targetStock) * 100)
                return (
                  <div key={i} className="data-row" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '1.25rem 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{l.product.name}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--status-danger)' }}>{l.current} / {l.product.targetStock}</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: 'var(--status-danger)' }}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
