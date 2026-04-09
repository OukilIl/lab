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
      <div className="nav-logo">
        <Box color="var(--accent-blue)" strokeWidth={2.5} />
        LabStock
      </div>
      <div className="nav-links">
        <Link href="/" className="nav-link">
          <LayoutDashboard size={20} />
          <span className="hidden-mobile">Dashboard</span>
        </Link>
        <Link href="/scan" className="nav-link">
          <ScanBarcode size={20} />
          <span className="hidden-mobile">Scan</span>
        </Link>
        <Link href="/products" className="nav-link">
          <Settings size={20} />
          <span className="hidden-mobile">Settings</span>
        </Link>
        <button onClick={handleLogout} className="nav-link btn-logout" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  )
}
