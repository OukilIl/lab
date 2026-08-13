'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, ScanLine, Settings } from 'lucide-react'

import { useI18n } from '@/lib/i18n/I18nProvider'
import type { TranslationKey } from '@/lib/i18n/translations'

const TABS: Array<{ href: string; key: TranslationKey; icon: typeof LayoutDashboard }> = [
  { href: '/', key: 'navOverview', icon: LayoutDashboard },
  { href: '/scan', key: 'navScan', icon: ScanLine },
  { href: '/products', key: 'navInventory', icon: Package },
  { href: '/settings', key: 'navSettings', icon: Settings },
]

export function NavBar() {
  const pathname = usePathname()
  const { t } = useI18n()

  return (
    <nav className="app-nav" aria-label="Main">
      {TABS.map(({ href, key, icon: Icon }) => {
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
            <span>{t(key)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
