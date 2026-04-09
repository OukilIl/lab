'use client'

import { useEffect, useState } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { addInventoryBatch } from '@/app/actions/inventory'
import { useRouter } from 'next/navigation'
import { Camera, RefreshCw } from 'lucide-react'

export function ScannerComponent() {
  const router = useRouter()
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [gtin, setGtin] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [message, setMessage] = useState<{text: string, type: 'error' | 'success', code?: string, gtin?: string} | null>(null)
  
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
      /* verbose= */ false
    )

    function onScanSuccess(decodedText: string) {
      setScanResult(decodedText)
      parseGS1(decodedText)
    }

    function onScanFailure(error: any) {
      // Ignore routine scan failures
    }

    scanner.render(onScanSuccess, onScanFailure)

    return () => {
      scanner.clear().catch(error => console.error("Failed to clear scanner", error))
    }
  }, [])

  function parseGS1(text: string) {
    let cleanText = text.replace(/[\(\)]/g, '')

    let parsedGtin = ''
    let parsedExp = ''
    let parsedBatch = ''

    if (cleanText.includes('01') && cleanText.length >= 16) {
      const idx = cleanText.indexOf('01')
      parsedGtin = cleanText.substring(idx + 2, idx + 16)
    } else {
      parsedGtin = cleanText
    }

    if (cleanText.includes('17')) {
      const idx = cleanText.indexOf('17')
      const expRaw = cleanText.substring(idx + 2, idx + 8)
      if (expRaw.length === 6) {
        let year = "20" + expRaw.substring(0, 2)
        let month = expRaw.substring(2, 4)
        let day = expRaw.substring(4, 6)
        if (day === "00") day = "01"
        parsedExp = `${year}-${month}-${day}`
      }
    }

    if (cleanText.includes('10')) {
      const idx = cleanText.indexOf('10')
      parsedBatch = cleanText.substring(idx + 2, Math.min(idx + 22, cleanText.length))
      let nextAI = parsedBatch.search(/17|21|01/)
      if (nextAI !== -1) {
        parsedBatch = parsedBatch.substring(0, nextAI)
      }
    }

    setGtin(parsedGtin)
    setExpirationDate(parsedExp)
    setBatchNumber(parsedBatch)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)
    const formData = new FormData(e.currentTarget)
    
    const result = await addInventoryBatch(formData)
    if (result?.error) {
      setMessage({ text: result.error, type: 'error', code: result.code, gtin: result.gtin })
    } else {
      setMessage({ text: 'Log entry successfully committed.', type: 'success' })
      setScanResult(null)
      setGtin('')
      setBatchNumber('')
      setExpirationDate('')
      router.refresh()
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
      <div className="surface-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem', background: 'var(--bg-app)', borderBottom: '1px solid var(--border-delicate)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
          <Camera size={18} color="var(--text-secondary)" /> Viewfinder
        </div>
        <div style={{ padding: '1rem', background: '#000000' }}>
          <div id="reader" style={{ width: '100%', border: 'none' }}></div>
        </div>
        {scanResult && (
          <div style={{ padding: '1rem', borderTop: '1px solid var(--border-delicate)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Raw Data Matrix String</div>
            <div style={{ background: 'rgba(14, 165, 233, 0.1)', color: 'var(--accent-blue-hover)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', wordBreak: 'break-all', fontFamily: 'monospace' }}>
              {scanResult}
            </div>
            <button onClick={() => { setScanResult(null); setGtin(''); setBatchNumber(''); setExpirationDate(''); setMessage(null); }} className="btn-secondary" style={{ marginTop: '1rem', width: 'auto', fontSize: '0.85rem' }}>
              <RefreshCw size={14} /> Clear Scan
            </button>
          </div>
        )}
      </div>

      <div className="surface-card">
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>Captured Details</h2>
        
        {message && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: message.type === 'error' ? 'var(--status-danger-bg)' : '#d1fae5', color: message.type === 'error' ? 'var(--status-danger)' : 'var(--status-ok)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem' }}>
            <p>{message.text}</p>
            {message.code === 'NOT_FOUND' && message.gtin && (
              <button 
                onClick={() => router.push(`/products?gtin=${message.gtin}`)}
                className="btn-primary" 
                style={{ marginTop: '1rem', background: 'var(--status-danger)', padding: '0.6rem 1rem' }}
              >
                Register this Tracker Now
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Extracted GTIN Identifier</label>
            <input name="gtin" type="text" value={gtin} onChange={e => setGtin(e.target.value)} required placeholder="Required" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group">
              <label>Encoded Batch</label>
              <input name="batchNumber" type="text" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} required placeholder="Required" />
            </div>
            <div className="input-group">
              <label>Expiration</label>
              <input name="expirationDate" type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} required />
            </div>
          </div>
          <div className="input-group">
            <label>Quantity Count</label>
            <input name="quantity" type="number" defaultValue="1" min="1" required />
          </div>
          <div className="input-group" style={{ marginBottom: '2rem' }}>
            <label>Supplementary Annotations (Optional)</label>
            <input name="notes" type="text" placeholder="e.g. Received frozen from Supplier A" />
          </div>
          
          <button type="submit" className="btn-primary">
            Store Inventory Record
          </button>
        </form>
      </div>
    </div>
  )
}
