'use client'

import { useState, FormEvent } from 'react'
import { setupApp } from '@/app/actions/auth'

export default function SetupPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const formData = new FormData(e.currentTarget)
    const password = formData.get('password') as string
    const confirm = formData.get('confirm') as string
    
    if (password !== confirm) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    const result = await setupApp(formData)
    
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '20px' }} className="fade-in">
      <div className="card" style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 className="h1" style={{ fontSize: '1.75rem', marginBottom: '8px', letterSpacing: '-0.02em' }}>Welcome to LabStock</h1>
          <p className="text-mute" style={{ fontSize: '0.9rem', fontWeight: 500 }}>Let's set up your secure admin account</p>
        </div>

        {error && <div style={{ color: 'var(--color-danger)', marginBottom: '1.5rem', padding: '12px', background: '#fef2f2', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 500, border: '1px solid #fee2e2' }}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="username">Create Username</label>
            <input id="username" name="username" type="text" required placeholder="e.g. lab_admin" />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="input-group">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" required placeholder="••••••••" />
            </div>
            <div className="input-group">
              <label htmlFor="confirm">Confirm</label>
              <input id="confirm" name="confirm" type="password" required placeholder="••••••••" />
            </div>
          </div>
          
          <button type="submit" className="btn btn-accent" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Initializing...' : 'Complete System Setup'}
          </button>
        </form>
        
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-light)', textAlign: 'center' }}>
          <p className="text-mute" style={{ fontSize: '0.75rem' }}>DATA STORED LOCALLY AT PRISMA/DEV.DB</p>
        </div>
      </div>
    </div>
  )
}
