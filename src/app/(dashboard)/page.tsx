import prisma from '@/lib/db'
import { AlertTriangle, TrendingDown, PackageOpen } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Fetch stats and warnings
  const products = await prisma.product.findMany({
    include: {
      inventoryBatches: true
    }
  })

  // Calculate warnings
  const now = new Date()
  const spoilageWarnings: any[] = []
  const lowStockWarnings: any[] = []
  
  let totalItems = 0
  
  for (const product of products) {
    let currentTotalForProduct = 0
    
    for (const batch of product.inventoryBatches) {
      currentTotalForProduct += batch.currentQuantity
      
      if (batch.currentQuantity > 0) {
        // Spoilage Check
        const expirationDate = new Date(batch.expirationDate)
        const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 3600 * 24))
        
        if (daysUntilExpiration <= product.expirationWarningDays) {
          spoilageWarnings.push({
            batch,
            product,
            daysUntilExpiration
          })
        }
      }
    }
    
    totalItems += currentTotalForProduct

    // Low Stock Check
    const lowStockThreshold = (product.targetStock * product.lowStockThresholdPct) / 100
    if (currentTotalForProduct <= lowStockThreshold && currentTotalForProduct > 0) {
      lowStockWarnings.push({
        product,
        currentTotal: currentTotalForProduct,
        threshold: lowStockThreshold
      })
    } else if (currentTotalForProduct === 0) {
      lowStockWarnings.push({
        product,
        currentTotal: 0,
        threshold: lowStockThreshold
      })
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>Inventory Dashboard</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        <div className="glass-card" style={{ maxWidth: '100%', borderColor: 'var(--border)' }}>
          <h3 style={{ color: 'var(--card-foreground)', fontSize: '0.875rem' }}>Total Items in Stock</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: '0.5rem 0' }}>{totalItems}</p>
        </div>
        
        <div className="glass-card" style={{ maxWidth: '100%', borderLeft: '4px solid var(--warning)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)', fontWeight: 600 }}>
            <AlertTriangle size={20} /> Expiring Soon
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 700, margin: '0.5rem 0' }}>{spoilageWarnings.length}</p>
        </div>

        <div className="glass-card" style={{ maxWidth: '100%', borderLeft: '4px solid var(--danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontWeight: 600 }}>
            <TrendingDown size={20} /> Low Stock Warnings
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 700, margin: '0.5rem 0' }}>{lowStockWarnings.length}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        <section>
          <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem' }}><AlertTriangle color="var(--warning)" /> Needs Attention (Spoiling)</h2>
          {spoilageWarnings.length === 0 ? (
           <p style={{ color: 'var(--card-foreground)' }}>No items are nearing expiration.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {spoilageWarnings.map((w, idx) => (
                <div key={idx} className="glass-card" style={{ maxWidth: '100%', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{w.product.name}</h4>
                      <p style={{ fontSize: '0.875rem', color: 'var(--card-foreground)' }}>Batch: {w.batch.batchNumber}</p>
                    </div>
                    <div style={{ background: '#fef3c7', color: '#b45309', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
                      {w.daysUntilExpiration <= 0 ? 'Expired' : `${w.daysUntilExpiration} days left`}
                    </div>
                  </div>
                  <div style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
                    <strong>Qty:</strong> {w.batch.currentQuantity} / {w.batch.initialQuantity}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem' }}><TrendingDown color="var(--danger)" /> Low Stock Alerts</h2>
          {lowStockWarnings.length === 0 ? (
            <p style={{ color: 'var(--card-foreground)' }}>All stock levels are healthy.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {lowStockWarnings.map((w, idx) => (
                <div key={idx} className="glass-card" style={{ maxWidth: '100%', padding: '1.5rem', borderLeft: '4px solid var(--danger)' }}>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{w.product.name}</h4>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.875rem' }}>
                    <div style={{ flex: 1, height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, Math.max(0, (w.currentTotal / w.product.targetStock) * 100))}%`, height: '100%', background: 'var(--danger)' }}></div>
                    </div>
                    <div style={{ color: 'var(--danger)', fontWeight: 600 }}>
                      {w.currentTotal} / {w.product.targetStock} Total
                    </div>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--card-foreground)', marginTop: '0.5rem' }}>Target: {w.product.targetStock} | Alert at &le; {w.threshold}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
