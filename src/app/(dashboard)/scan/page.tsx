import { ScanBarcode } from 'lucide-react'
import { ScannerComponent } from './ScannerComponent'

export default function ScanPage() {
  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ScanBarcode size={28} color="var(--accent-blue)" /> Inventory Scanner
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Scan GS1 Datamatrix codes to automatically decode components.</p>
      </div>

      <ScannerComponent />
    </div>
  )
}
