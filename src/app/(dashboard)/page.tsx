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
    <div className="fade-in">
      <h1 className="h1" style={{ marginBottom: '2rem' }}>Inventory Status</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p className="text-mute" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Available Stock</p>
              <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: '4px 0', letterSpacing: '-0.03em' }}>{totalItems}</p>
            </div>
            <div style={{ padding: '12px', background: 'var(--accent-blue-soft)', borderRadius: '12px', color: 'var(--accent-blue)' }}>
              <PackageOpen size={24} />
            </div>
          </div>
        </div>
        
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p className="text-mute" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Expiring Soon</p>
              <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: '4px 0', letterSpacing: '-0.03em', color: spoilageWarnings.length > 0 ? 'var(--color-warning)' : 'inherit' }}>{spoilageWarnings.length}</p>
            </div>
            <div style={{ padding: '12px', background: spoilageWarnings.length > 0 ? '#fffbeb' : 'var(--bg-primary)', borderRadius: '12px', color: spoilageWarnings.length > 0 ? 'var(--color-warning)' : 'var(--text-secondary)' }}>
              <AlertTriangle size={24} />
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p className="text-mute" style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Low Stock</p>
              <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: '4px 0', letterSpacing: '-0.03em', color: lowStockWarnings.length > 0 ? 'var(--color-danger)' : 'inherit' }}>{lowStockWarnings.length}</p>
            </div>
            <div style={{ padding: '12px', background: lowStockWarnings.length > 0 ? '#fef2f2' : 'var(--bg-primary)', borderRadius: '12px', color: lowStockWarnings.length > 0 ? 'var(--color-danger)' : 'var(--text-secondary)' }}>
              <TrendingDown size={24} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2.5rem' }}>
        <section>
          <h2 className="h2" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ width: '8px', height: '24px', background: 'var(--color-warning)', borderRadius: '4px' }}></span>
            Needs Attention (Spoiling)
          </h2>
          {spoilageWarnings.length === 0 ? (
           <div className="card" style={{ padding: '20px', borderStyle: 'dashed', background: 'transparent', textAlign: 'center' }}>
             <p className="text-mute">No items are nearing expiration.</p>
           </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {spoilageWarnings.map((w, idx) => (
                <div key={idx} className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '2px' }}>{w.product.name}</h4>
                      <p className="text-mute" style={{ fontSize: '0.8rem' }}>Batch {w.batch.batchNumber}</p>
                    </div>
                    <div style={{ background: '#fffbeb', color: '#92400e', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                      {w.daysUntilExpiration <= 0 ? 'Expired' : `${w.daysUntilExpiration}D REMAINING`}
                    </div>
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-mute">Current Quantity</span>
                    <span style={{ fontWeight: 600 }}>{w.batch.currentQuantity} / {w.batch.initialQuantity}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="h2" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ width: '8px', height: '24px', background: 'var(--color-danger)', borderRadius: '4px' }}></span>
            Low Stock Alerts
          </h2>
          {lowStockWarnings.length === 0 ? (
            <div className="card" style={{ padding: '20px', borderStyle: 'dashed', background: 'transparent', textAlign: 'center' }}>
              <p className="text-mute">All stock levels are healthy.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {lowStockWarnings.map((w, idx) => (
                <div key={idx} className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>{w.product.name}</h4>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-danger)' }}>{w.currentTotal} / {w.product.targetStock}</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-primary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${Math.min(100, Math.max(0, (w.currentTotal / w.product.targetStock) * 100))}%`, 
                        height: '100%', 
                        background: 'var(--color-danger)',
                        borderRadius: '3px'
                      }} 
                    />
                  </div>
                  <p className="text-mute" style={{ fontSize: '0.7rem', marginTop: '8px', textAlign: 'right' }}>
                    CRITICAL AT {w.threshold} UNITS ({w.product.lowStockThresholdPct}%)
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
