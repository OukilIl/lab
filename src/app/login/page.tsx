'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { checkFirstSetup, loginApp } from '@/app/actions/auth'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    checkFirstSetup().then(isFirst => {
      if (isFirst) router.push('/setup')
    })
  }, [router])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const formData = new FormData(e.currentTarget)
    const result = await loginApp(formData)
    
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '20px' }} className="fade-in">
      <div className="card" style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 className="h1" style={{ fontSize: '1.75rem', marginBottom: '4px', letterSpacing: '-0.02em' }}>LabStock</h1>
          <p className="text-mute" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Scientific Inventory Manager</p>
        </div>

        {error && <div style={{ color: 'var(--color-danger)', marginBottom: '1.5rem', padding: '12px', background: '#fef2f2', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 500, border: '1px solid #fee2e2' }}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" type="text" required placeholder="admin" />
          </div>
          
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required placeholder="••••••••" />
          </div>
          
          <button type="submit" className="btn btn-accent" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
