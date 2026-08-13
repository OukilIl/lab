import type { ReactNode } from 'react'

import { AppGate } from '@/components/AppGate'
import { NavBar } from './NavBar'
import { TopHeader } from './TopHeader'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppGate>
      <div className="app-shell">
        <TopHeader />
        <NavBar />
        <main className="app-main page-enter">{children}</main>
      </div>
    </AppGate>
  )
}
