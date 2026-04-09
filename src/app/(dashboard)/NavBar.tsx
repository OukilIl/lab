'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ScanBarcode, Package } from 'lucide-react'

export function NavBar() {
  const pathname = usePathname()

  return (
    <nav className="mobile-nav-wrapper">
      <div className="nav-links">
        <Link href="/" className={`nav-item ${pathname === '/' ? 'active' : ''}`}>
          <LayoutDashboard size={20} strokeWidth={pathname === '/' ? 2.5 : 2} />
          <span>Dashboard</span>
        </Link>
        <Link href="/scan" className={`nav-item ${pathname === '/scan' ? 'active' : ''}`}>
          <ScanBarcode size={20} strokeWidth={pathname === '/scan' ? 2.5 : 2} />
          <span>Scan</span>
        </Link>
        <Link href="/products" className={`nav-item ${pathname === '/products' ? 'active' : ''}`}>
          <Package size={20} strokeWidth={pathname === '/products' ? 2.5 : 2} />
          <span>Products</span>
        </Link>
      </div>
    </nav>
  )
}
