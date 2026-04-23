'use client'

import { useEffect, useRef, useState } from 'react'
import { addInventoryBatch } from '@/app/actions/inventory'
import { decodeBarcodeAction } from '@/app/actions/vision'
import { useRouter } from 'next/navigation'
import { Camera, RefreshCw, Zap, Search } from 'lucide-react'

export function ScannerComponent() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [hasCamera, setHasCamera] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)
  
  const [gtin, setGtin] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [message, setMessage] = useState<{text: string, type: 'error' | 'success', code?: string, gtin?: string} | null>(null)
  
  // Initialize camera
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setHasCamera(true)
        }
      } catch (err) {
        console.error("Camera access denied:", err)
        setMessage({ text: 'Camera access denied. Please ensure you are on HTTPS or localhost.', type: 'error' })
      }
    }

    startCamera()

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach(track => track.stop())
      }
    }
  }, [])

  async function handleCapture() {
    if (!videoRef.current || !canvasRef.current) return
    
    setIsProcessing(true)
    setMessage(null)

    const video = videoRef.current
    const canvas = canvasRef.current
    
    // Set canvas dimensions to match actual video stream for high-res capture
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    const context = canvas.getContext('2d')
    if (!context) return

    // Draw current frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    // Convert to Blob
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setIsProcessing(false)
        return
      }

      const formData = new FormData()
      formData.append('image', blob, 'capture.jpg')

      const result = await decodeBarcodeAction(formData)

      if (result.error) {
        setMessage({ text: result.error, type: 'error' })
      } else {
        setGtin(result.gtin || '')
        setBatchNumber(result.batch || '')
        setExpirationDate(result.expirationDate || '')
        setScanResult(result.raw || 'Detected')
        const fmt = result.format === 'HIBC' ? 'HIBC (IVDR/UDI)' : 'GS1'
        setMessage({ text: `Decoded via ${fmt}. Verify fields below before storing.`, type: 'success' })
      }
      setIsProcessing(false)
    }, 'image/jpeg', 0.95)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)
    const form = e.currentTarget
    const formData = new FormData(form)
    
    const result = await addInventoryBatch(formData)
    if (result?.error) {
      setMessage({ text: result.error, type: 'error', code: result.code, gtin: result.gtin })
    } else {
      setMessage({ text: 'Log entry successfully committed.', type: 'success' })
      setScanResult(null)
      setGtin('')
      setBatchNumber('')
      setExpirationDate('')
      form.reset()
      router.refresh()
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '2rem' }}>
      
      {/* Left: Viewfinder & Action */}
      <div className="surface-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem', background: 'var(--bg-app)', borderBottom: '1px solid var(--border-delicate)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
          <Camera size={18} color="var(--text-secondary)" /> Vision Engine
        </div>
        
        <div style={{ position: 'relative', background: '#000', aspectRatio: '4/3', overflow: 'hidden' }}>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          
          {/* Processing Overlay */}
          {isProcessing && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
              <Zap className="animate-pulse" color="var(--accent-blue)" size={48} />
              <p style={{ color: '#fff', marginTop: '1rem', fontWeight: 500 }}>Analyzing Blueprint...</p>
            </div>
          )}

          {/* Central Target UI */}
          <div style={{ position: 'absolute', inset: '20%', border: '2px dashed rgba(255,255,255,0.3)', pointerEvents: 'none', borderRadius: 'var(--radius-md)' }}></div>
        </div>

        <div style={{ padding: '1.5rem' }}>
          <button 
            onClick={handleCapture} 
            disabled={!hasCamera || isProcessing}
            className="btn-primary" 
            style={{ height: '3.5rem', fontSize: '1.1rem' }}
          >
            {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <Search size={20} />}
            {isProcessing ? 'Processing Snap...' : 'Snap & Analyze Barcode'}
          </button>
          
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>
            Hold steady for 1 second after snapping. We will run 3 high-contrast passes on the server.
          </p>
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      {/* Right: Manual Review & Edit */}
      <div className="surface-card">
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>Extracted Metadata</h2>
        
        {message && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: message.type === 'error' ? 'var(--status-danger-bg)' : '#d1fae5', color: message.type === 'error' ? 'var(--status-danger)' : 'var(--status-ok)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem' }}>
            <p>{message.text}</p>
            {message.code === 'NOT_FOUND' && message.gtin && (
              <button 
                onClick={() => router.push(`/products?gtin=${message.gtin}`)}
                className="btn-primary" 
                style={{ marginTop: '1rem', background: 'var(--status-danger)', padding: '0.6rem 1rem' }}
              >
                Establish Product Profile
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>GTIN / Identifier</label>
            <input name="gtin" type="text" value={gtin} onChange={e => setGtin(e.target.value)} required placeholder="Required" />
          </div>
          <div className="form-row-split">
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label>Encoded Batch</label>
              <input name="batchNumber" type="text" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} required placeholder="Required" />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label>Expiration</label>
              <input name="expirationDate" type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} required />
            </div>
          </div>
          <div className="input-group" style={{ marginTop: '1.25rem' }}>
            <label>Unit Quantity</label>
            <input name="initialQuantity" type="number" defaultValue="1" min="1" required />
          </div>
          <div className="input-group" style={{ marginBottom: '2rem' }}>
            <label>Supplementary Annotations</label>
            <input name="notes" type="text" placeholder="e.g. Received frozen from Supplier A" />
          </div>
          
          <button type="submit" className="btn-primary" style={{ background: scanResult ? 'var(--status-ok)' : 'var(--accent-blue)' }}>
            Confirm & Log to Archive
          </button>
        </form>
      </div>
    </div>
  )
}
