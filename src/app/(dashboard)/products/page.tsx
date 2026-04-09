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
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '0.5rem' }}>Inventory Setup</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Configure tracking goals and log discrete medicine usage.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 350px) 1fr', gap: '2rem', alignItems: 'start' }}>
        <CreateProductForm />

        <div>
          <h2 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem' }}>
            <Package size={20} color="var(--text-secondary)" /> Manage Active Batches
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {products.map(product => (
              <div key={product.id} className="surface-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-delicate)', paddingBottom: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{product.name}</h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>GTIN: {product.gtin}</div>
                  </div>
                  <div className="badge" style={{ background: 'var(--bg-app)', color: 'var(--text-secondary)', border: '1px solid var(--border-delicate)' }}>
                    Target: {product.targetStock}
                  </div>
                </div>

                {product.inventoryBatches.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No active inventory blocks. Please scan to replenish.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {product.inventoryBatches.map(batch => (
                      <div key={batch.id} style={{ background: 'var(--bg-app)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-delicate)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>Batch: {batch.batchNumber}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Exp: {batch.expirationDate?.toISOString().split('T')[0] || 'N/A'}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--accent-blue)', background: 'var(--accent-blue-light)', padding: '0.25rem 0.75rem', borderRadius: '1rem', fontSize: '0.85rem' }}>
                            Qty: {batch.currentQuantity}
                          </span>
                          <form action={logUsage as any} style={{ display: 'flex', gap: '0.5rem' }}>
                            <input type="hidden" name="inventoryBatchId" value={batch.id} />
                            <input name="quantityUsed" type="number" min="1" max={batch.currentQuantity} defaultValue="1" style={{ width: '60px', padding: '0.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-delicate)', textAlign: 'center', outline: 'none' }} />
                            <button type="submit" className="btn-primary" style={{ padding: '0.4rem 0.75rem', width: 'auto', fontSize: '0.85rem' }}>Drop</button>
                          </form>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
