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
    <div className="glass-card" style={{ maxWidth: '100%', position: 'sticky', top: '100px' }}>
      <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Plus size={20}/> Register New Product</h2>
      
      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', padding: '0.5rem', background: '#fee2e2', borderRadius: '0.5rem' }}>{error}</div>}

      <div style={{ marginBottom: '1.5rem' }}>
        {!scannerOpen ? (
          <button type="button" onClick={() => setScannerOpen(true)} className="btn-primary" style={{ background: 'var(--foreground)', color: 'var(--background)' }}>
            <Camera size={18} /> Open Scanner to Auto-fill GTIN
          </button>
        ) : (
          <div style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
            <div id="product-reader" style={{ width: '100%', border: 'none' }}></div>
            <button type="button" onClick={() => setScannerOpen(false)} className="btn-primary" style={{ marginTop: '0.5rem', background: 'var(--danger)' }}>
              <CameraOff size={18} /> Close Scanner
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label>GTIN / Identifier</label>
          <input name="gtin" type="text" required placeholder="e.g. 0038000494002" value={gtin} onChange={e => setGtin(e.target.value)} />
        </div>
        <div className="input-group">
          <label>Product Name</label>
          <input name="name" type="text" required placeholder="e.g. Lab Reagent A" />
        </div>
        <div className="input-group">
          <label>Target Stock (Units)</label>
          <input name="targetStock" type="number" defaultValue="100" required />
        </div>
        <div className="input-group">
          <label>Low Stock Threshold (%)</label>
          <input name="lowStockThresholdPct" type="number" defaultValue="20" required />
        </div>
        <div className="input-group">
          <label>Warning Days before Expiration</label>
          <input name="expirationWarningDays" type="number" defaultValue="30" required />
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Adding...' : 'Add Product Settings'}
        </button>
      </form>
    </div>
  )
}
