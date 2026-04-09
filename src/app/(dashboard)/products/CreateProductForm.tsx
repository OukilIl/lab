'use client'

import { useState, useEffect } from 'react'
import { Plus, Camera, CameraOff } from 'lucide-react'
import { addProduct } from '@/app/actions/inventory'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { useRouter, useSearchParams } from 'next/navigation'

export function CreateProductForm() {
  const searchParams = useSearchParams()
  const [gtin, setGtin] = useState(searchParams.get('gtin') || '')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    
    if (scannerOpen) {
      setTimeout(() => {
        scanner = new Html5QrcodeScanner(
          "product-reader",
          { fps: 10, qrbox: { width: 250, height: 250 } },
          /* verbose= */ false
        )
        
        scanner.render(onScanSuccess, onScanFailure)
      }, 100)
    }

    function onScanSuccess(decodedText: string) {
      let textToParse = decodedText.replace(/[\(\)]/g, '')

      if (textToParse.includes('01') && textToParse.length >= 16) {
        const gtinIdx = textToParse.indexOf('01')
        setGtin(textToParse.substring(gtinIdx + 2, gtinIdx + 16))
      } else {
        // Fallback for simple 1D barcodes that are purely the GTIN or UPC
        setGtin(textToParse)
      }
      
      setScannerOpen(false) // Close scanner after successful scan
      if (scanner) scanner.clear().catch(console.error)
    }

    function onScanFailure() { /* ignore */ }

    return () => {
      if (scanner) scanner.clear().catch(console.error)
    }
  }, [scannerOpen])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    const result = await addProduct(formData)
    
    if (result?.error) {
      setError(result.error)
    } else {
      setGtin('')
      e.currentTarget.reset()
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="card" style={{ position: 'sticky', top: '100px' }}>
      <h2 className="h2" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Plus size={20} color="var(--accent-blue)" />
        New Product
      </h2>
      
      {error && <div style={{ color: 'var(--color-danger)', marginBottom: '1rem', padding: '10px', background: '#fef2f2', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 500 }}>{error}</div>}

      <div style={{ marginBottom: '1.5rem' }}>
        {!scannerOpen ? (
          <button type="button" onClick={() => setScannerOpen(true)} className="btn btn-primary" style={{ width: '100%' }}>
            <Camera size={18} color="var(--accent-blue)" /> Scan to Auto-fill GTIN
          </button>
        ) : (
          <div style={{ padding: '8px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)' }}>
            <div id="product-reader" style={{ width: '100%', border: 'none', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}></div>
            <button type="button" onClick={() => setScannerOpen(false)} className="btn" style={{ width: '100%', marginTop: '8px', color: 'var(--color-danger)' }}>
              <CameraOff size={18} /> Close Scanner
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label>GTIN / Identifier</label>
          <input name="gtin" type="text" required placeholder="0038000494002" value={gtin} onChange={e => setGtin(e.target.value)} />
        </div>
        <div className="input-group">
          <label>Product Name</label>
          <input name="name" type="text" required placeholder="Lab Reagent A" />
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="input-group">
            <label>Target Stock</label>
            <input name="targetStock" type="number" defaultValue="100" required />
          </div>
          <div className="input-group">
            <label>Low Alert %</label>
            <input name="lowStockThresholdPct" type="number" defaultValue="20" required />
          </div>
        </div>

        <div className="input-group">
          <label>Expiry Warning Days</label>
          <input name="expirationWarningDays" type="number" defaultValue="30" required />
        </div>
        
        <button type="submit" className="btn btn-accent" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
          {loading ? 'Adding...' : 'Register Product'}
        </button>
      </form>
    </div>
  )
}
