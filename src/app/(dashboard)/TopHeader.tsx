'use client'

import { LogOut, FlaskConical } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function TopHeader() {
  const router = useRouter()
  
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <header className="top-header">
      <div className="brand">
        <FlaskConical size={24} color="var(--accent-blue)" />
        Lab<span>Stock</span>
      </div>
      <button 
        onClick={handleLogout} 
        style={{ 
          background: 'none', border: 'none', cursor: 'pointer', 
          color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', 
          gap: '0.4rem', fontSize: '0.875rem', fontWeight: 500,
          transition: 'color 0.2s'
        }}
        onMouseOver={e => e.currentTarget.style.color = 'var(--text-primary)'}
        onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}
      >
        <LogOut size={16} /> <span className="hide-on-mobile">Sign Out</span>
      </button>
    </header>
  )
}
