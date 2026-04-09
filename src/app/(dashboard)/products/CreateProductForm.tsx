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
        setGtin(textToParse)
      }
      
      setScannerOpen(false)
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
    <div className="surface-card" style={{ maxWidth: '100%', position: 'sticky', top: '100px' }}>
      <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem' }}>
        <Plus size={20} color="var(--accent-blue)" /> Product Blueprint
      </h2>
      
      {error && <div style={{ color: 'var(--status-danger)', marginBottom: '1rem', padding: '0.75rem', background: 'var(--status-danger-bg)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}>{error}</div>}

      <div style={{ marginBottom: '1.5rem' }}>
        {!scannerOpen ? (
          <button type="button" onClick={() => setScannerOpen(true)} className="btn-secondary">
            <Camera size={18} /> Auto-Scan GTIN
          </button>
        ) : (
          <div style={{ padding: '0.5rem', border: '1px solid var(--border-delicate)', borderRadius: 'var(--radius-md)', background: 'var(--bg-app)' }}>
            <div id="product-reader" style={{ width: '100%', border: 'none' }}></div>
            <button type="button" onClick={() => setScannerOpen(false)} className="btn-primary" style={{ marginTop: '0.5rem', background: 'var(--status-danger)' }}>
              <CameraOff size={18} /> Close Viewfinder
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label>Global Trade Item Number</label>
          <input name="gtin" type="text" required placeholder="e.g. 0038000494002" value={gtin} onChange={e => setGtin(e.target.value)} />
        </div>
        <div className="input-group">
          <label>Product Nomenclature</label>
          <input name="name" type="text" required placeholder="e.g. Morphine 10mg" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="input-group">
            <label>Target Level</label>
            <input name="targetStock" type="number" defaultValue="100" required />
          </div>
          <div className="input-group">
            <label>Warning %</label>
            <input name="lowStockThresholdPct" type="number" defaultValue="20" required />
          </div>
        </div>
        <div className="input-group">
          <label>Spoilage Warning (Days)</label>
          <input name="expirationWarningDays" type="number" defaultValue="30" required />
        </div>
        <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '1rem' }}>
          {loading ? 'Committing...' : 'Establish Blueprint'}
        </button>
      </form>
    </div>
  )
}
