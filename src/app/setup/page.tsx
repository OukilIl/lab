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
    <div className="auth-container">
      <div className="glass-card">
        <h1 style={{ marginBottom: '0.5rem', textAlign: 'center' }}>First Time Setup</h1>
        <p style={{ color: 'var(--card-foreground)', fontSize: '0.875rem', textAlign: 'center', marginBottom: '1.5rem'}}>
          Create the primary user account to secure your laboratory data.
        </p>
        
        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', padding: '0.5rem', background: '#fee2e2', borderRadius: '0.5rem' }}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" type="text" required />
          </div>
          
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required />
          </div>

          <div className="input-group">
            <label htmlFor="confirm">Confirm Password</label>
            <input id="confirm" name="confirm" type="password" required />
          </div>
          
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Setting up...' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
