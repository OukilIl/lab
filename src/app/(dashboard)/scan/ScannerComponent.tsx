'use client'

import { useEffect, useState } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { addInventoryBatch } from '@/app/actions/inventory'
import { useRouter } from 'next/navigation'

export function ScannerComponent() {
  const router = useRouter()
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [gtin, setGtin] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [message, setMessage] = useState<{text: string, type: 'error' | 'success', code?: string, gtin?: string} | null>(null)
  
  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    
    // Create DOM element for scanner
    setTimeout(() => {
      scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      )
      
      scanner.render(onScanSuccess, onScanFailure)
    }, 100)
    
    function onScanSuccess(decodedText: string) {
      setScanResult(decodedText)
      parseGS1(decodedText)
      // Pause after scan
      if (scanner) scanner.pause()
    }

    function onScanFailure(error: any) {
      // ignore
    }

    return () => {
      if (scanner) scanner.clear().catch(console.error)
    }
  }, [])

  function parseGS1(text: string) {
    // Attempt standard GS1 parsing. 
    // Usually has (01) or 01 prefix for GTIN 14 digits
    // (17) or 17 for expiration 6 digits YYMMDD
    // (10) or 10 for batch
    
    let textToParse = text.replace(/[\(\)]/g, '') // remove parens if any
    
    // Very naive GS1 extractor
    let _gtin = ''
    let _batch = ''
    let _exp = ''

    if (textToParse.includes('01') && textToParse.length >= 16) {
      const gtinIdx = textToParse.indexOf('01')
      _gtin = textToParse.substring(gtinIdx + 2, gtinIdx + 16)
    }

    if (textToParse.includes('17')) {
      const expIdx = textToParse.indexOf('17')
      const expRaw = textToParse.substring(expIdx + 2, expIdx + 8)
      if (expRaw.length === 6 && !isNaN(Number(expRaw))) {
        // YYMMDD
        const yy = parseInt(expRaw.substring(0, 2))
        const mm = parseInt(expRaw.substring(2, 4))
        const dd = parseInt(expRaw.substring(4, 6))
        
        // Simple 2000s assuming
        const year = 2000 + yy
        
        // Ensure month and day are 2 digits for input type="date"
        const formattedMM = mm.toString().padStart(2, '0')
        // if DD is 00 according to standard, last day of month
        let formattedDD = dd === 0 ? '28' : dd.toString().padStart(2, '0')
        
        _exp = `${year}-${formattedMM}-${formattedDD}`
      }
    }

    if (textToParse.includes('10')) {
      // Batch is variable length up to 20, usually to the end of string or until next AI.
      // We will try finding it assuming it's at the end or use regex
      const match = textToParse.match(/10([A-Za-z0-9]{1,20})/)
      if (match) {
        _batch = match[1]
      }
    }

    if (_gtin) setGtin(_gtin)
    if (_batch) setBatchNumber(_batch)
    if (_exp) setExpirationDate(_exp)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)
    const formData = new FormData(e.currentTarget)
    
    const result = await addInventoryBatch(formData)
    if (result?.error) {
      setMessage({ text: result.error, type: 'error', code: result.code, gtin: result.gtin })
    } else {
      setMessage({ text: 'Added successfully!', type: 'success' })
      setScanResult(null)
      setGtin('')
      setBatchNumber('')
      setExpirationDate('')
      // clear the scanner UI somehow or prompt
    }
  }

  const resetScan = () => {
    setScanResult(null)
    setGtin('')
    setBatchNumber('')
    setExpirationDate('')
    setMessage(null)
    // Would resume scanner but html5-qrcode clear/resume is tricky via React ref without full re-render, 
    // reloading component by forcing state is easiest
    window.location.reload()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 400px)', gap: '2rem' }}>
      <div>
        <h2 style={{ marginBottom: '1rem' }}>Scan Barcode</h2>
        <div className="glass-card" style={{ maxWidth: '100%', padding: '1rem' }}>
          <div id="reader" style={{ width: '100%', border: 'none' }}></div>
          {scanResult && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--success)', color: 'white', borderRadius: '0.5rem' }}>
              <strong>Scan Successful!</strong><br/>
              <span style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>Raw: {scanResult}</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="glass-card" style={{ maxWidth: '100%' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Add to Inventory</h2>
        
        {message && (
          <div style={{ marginBottom: '1rem', padding: '1rem', background: message.type === 'error' ? '#fee2e2' : '#d1fae5', color: message.type === 'error' ? '#991b1b' : '#065f46', borderRadius: '0.5rem' }}>
            <p>{message.text}</p>
            {message.code === 'NOT_FOUND' && message.gtin && (
              <button 
                onClick={() => router.push(`/products?gtin=${message.gtin}`)}
                className="btn-primary" 
                style={{ marginTop: '0.75rem', background: 'var(--danger)' }}
              >
                Register this GTIN now
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>GTIN (Product ID)</label>
            <input name="gtin" value={gtin} onChange={e => setGtin(e.target.value)} required placeholder="14-digit GTIN" />
          </div>
          <div className="input-group">
            <label>Batch / Lot Number</label>
            <input name="batchNumber" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} required placeholder="Alphanumeric batch" />
          </div>
          <div className="input-group">
            <label>Expiration Date</label>
            <input name="expirationDate" type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} required />
          </div>
          <div className="input-group">
            <label>Initial Quantity</label>
            <input name="initialQuantity" type="number" defaultValue="1" required />
          </div>
          <div className="input-group">
            <label>Producer (Optional)</label>
            <input name="producer" type="text" placeholder="e.g. Pfizer" />
          </div>
          <div className="input-group">
            <label>Notes (Optional)</label>
            <input name="notes" type="text" placeholder="e.g. Fridge 2" />
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save Batch</button>
            {scanResult && <button type="button" onClick={resetScan} className="btn-primary" style={{ background: 'var(--border)', color: 'var(--foreground)' }}>Scan Another</button>}
          </div>
        </form>
      </div>
    </div>
  )
}
