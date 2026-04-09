'use client'

import { FormEvent, useState } from 'react'
import { FlaskConical, LogIn } from 'lucide-react'
import { loginApp } from '@/app/actions/auth'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const formData = new FormData(e.currentTarget)
    const result = await loginApp(formData)
    
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="auth-container">
      <div className="surface-card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--accent-blue-light)', borderRadius: '50%', marginBottom: '1rem', boxShadow: '0 4px 20px -5px rgba(14, 165, 233, 0.2)' }}>
            <FlaskConical size={32} color="var(--accent-blue)" />
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>LabStock Access</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Please enter your credentials to manage laboratory inventory.</p>
        </div>

        {error && (
          <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', background: 'var(--status-danger-bg)', color: 'var(--status-danger)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Identifier</label>
            <input name="username" type="text" required placeholder="User ID" />
          </div>
          <div className="input-group">
            <label>Passkey</label>
            <input name="password" type="password" required placeholder="••••••••" />
          </div>
          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '1rem' }}>
            <LogIn size={18} /> {loading ? 'Authenticating...' : 'Secure Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
