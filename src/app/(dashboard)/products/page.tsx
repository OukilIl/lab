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
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="h1">Product Management</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2.5rem', alignItems: 'start' }}>
        <CreateProductForm />

        <div>
          <h2 className="h2" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Package size={20} color="var(--accent-blue)" /> 
            Active Inventory
          </h2>
          
          {products.length === 0 ? (
            <div className="card" style={{ borderStyle: 'dashed', background: 'transparent', textAlign: 'center' }}>
              <p className="text-mute">No products registered yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {products.map(product => (
                <div key={product.id} className="card" style={{ padding: '0' }}>
                  <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '2px' }}>{product.name}</h3>
                      <p className="text-mute" style={{ fontSize: '0.8rem' }}>GTIN: {product.gtin}</p>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: 600 }}>
                      <p className="text-mute">TARGET: {product.targetStock}</p>
                      <p style={{ color: 'var(--accent-blue)' }}>ALERT &le; {product.lowStockThresholdPct}%</p>
                    </div>
                  </div>

                  <div style={{ padding: '20px' }}>
                    {product.inventoryBatches.length === 0 ? (
                      <p className="text-mute" style={{ fontSize: '0.85rem' }}>No active stock for this product.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {product.inventoryBatches.map(batch => (
                          <div key={batch.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                            <div>
                              <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>BATCH {batch.batchNumber}</p>
                              <p className="text-mute" style={{ fontSize: '0.75rem' }}>EXP {new Date(batch.expirationDate).toLocaleDateString()}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{batch.currentQuantity} UNITS</span>
                              <form action={logUsage as any} style={{ display: 'flex', gap: '4px' }}>
                                <input type="hidden" name="inventoryBatchId" value={batch.id} />
                                <input name="quantityUsed" type="number" min="1" max={batch.currentQuantity} defaultValue="1" style={{ width: '50px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-medium)', fontSize: '0.8rem' }} />
                                <button type="submit" className="btn btn-accent" style={{ padding: '6px 10px', fontSize: '0.75rem' }}>Use</button>
                              </form>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
