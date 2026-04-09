'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, LayoutDashboard, Settings, ScanBarcode, Box } from 'lucide-react'

export function NavBar() {
  const router = useRouter()
  
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <nav className="navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.25rem' }}>
        <Box className="text-primary" />
        LabStock
      </div>
      <div className="nav-links">
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><LayoutDashboard size={18} /> Dashboard</Link>
        <Link href="/scan" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><ScanBarcode size={18} /> Scan</Link>
        <Link href="/products" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Settings size={18} /> Products</Link>
        <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '1rem', fontWeight: 500 }}>
          <LogOut size={18} /> Logout
        </button>
      </div>
    </nav>
  )
}
