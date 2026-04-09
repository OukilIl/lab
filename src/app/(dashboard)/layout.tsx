import { NavBar } from './NavBar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fade-in">
      <NavBar />
      <main className="main-layout">
        {children}
      </main>
    </div>
  )
}
