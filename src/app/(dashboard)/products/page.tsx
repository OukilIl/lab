import prisma from '@/lib/db'
import { Package } from 'lucide-react'
import { logUsage } from '@/app/actions/inventory'
import { CreateProductForm } from './CreateProductForm'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    include: {
      inventoryBatches: {
        where: { currentQuantity: { gt: 0 } },
        orderBy: { expirationDate: 'asc' }
      }
    }
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Products Management</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 350px) 1fr', gap: '2rem', alignItems: 'start' }}>
        <CreateProductForm />

        <div>
          <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Package size={20}/> Inventory Batches by Product</h2>
          {products.length === 0 ? (
            <p style={{ color: 'var(--card-foreground)' }}>No products registered yet. Please register a product using the form.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {products.map(product => (
                <div key={product.id} className="glass-card" style={{ maxWidth: '100%' }}>
                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{product.name}</h3>
                      <p style={{ fontSize: '0.875rem', color: 'var(--card-foreground)' }}>GTIN: {product.gtin}</p>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
                      <p>Target: {product.targetStock}</p>
                      <p>Warning &le;{product.lowStockThresholdPct}% | Alerts at {product.expirationWarningDays} days</p>
                    </div>
                  </div>

                  {product.inventoryBatches.length === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--card-foreground)' }}>No active stock for this product.</p>
                  ) : (
                    <div>
                      <h4 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', textTransform: 'uppercase', color: 'var(--card-foreground)' }}>Active Batches</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {product.inventoryBatches.map(batch => (
                          <div key={batch.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.03)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                            <div>
                              <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>Batch: {batch.batchNumber}</p>
                              <p style={{ fontSize: '0.75rem', color: 'var(--card-foreground)' }}>Exp: {new Date(batch.expirationDate).toLocaleDateString()}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <span style={{ fontWeight: 700 }}>Qty: {batch.currentQuantity}</span>
                              <form action={logUsage as any} style={{ display: 'flex', gap: '0.25rem' }}>
                                <input type="hidden" name="inventoryBatchId" value={batch.id} />
                                <input name="quantityUsed" type="number" min="1" max={batch.currentQuantity} defaultValue="1" style={{ width: '60px', padding: '0.25rem', borderRadius: '0.25rem', border: '1px solid var(--border)' }} />
                                <button type="submit" className="btn-primary" style={{ padding: '0.25rem 0.5rem', background: 'var(--success)' }}>Use</button>
                              </form>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
