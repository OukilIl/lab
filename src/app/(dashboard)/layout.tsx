import type { ReactNode } from 'react'

import { AppGate } from '@/components/AppGate'
import { NavBar } from './NavBar'

/**
 * No top header: everything it held (mode badge, theme, sign-out) lives in
 * the Settings tab. DOM order is content-then-nav so the nav sits at the
 * bottom on phones; the desktop stylesheet reorders it to the top.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppGate>
      <div className="app-shell">
        <main className="app-main page-enter">{children}</main>
        <NavBar />
      </div>
    </AppGate>
  )
}
