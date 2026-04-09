import { NavBar } from './NavBar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <NavBar />
      <main className="main-content" style={{ flex: 1, width: '100%' }}>
        {children}
      </main>
    </div>
  )
}
