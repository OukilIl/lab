'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, ScanLine } from 'lucide-react'

const TABS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/scan', label: 'Scan', icon: ScanLine },
  { href: '/products', label: 'Inventory', icon: Package },
] as const

export function NavBar() {
  const pathname = usePathname()

  return (
    <nav className="app-nav" aria-label="Main">
      {TABS.map(({ href, label, icon: Icon }) => {
        // With trailingSlash enabled for the mobile export, '/scan' arrives
        // as '/scan/', so compare on a normalised path.
        const current = pathname.replace(/\/+$/, '') || '/'
        const active = current === href

        return (
          <Link
            key={href}
            href={href}
            className="nav-item"
            data-active={active}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={21} strokeWidth={active ? 2.4 : 1.9} aria-hidden />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
