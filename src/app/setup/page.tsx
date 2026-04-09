import { FlaskConical, ShieldCheck } from 'lucide-react'
import { setupApp } from '@/app/actions/auth'

export default function SetupPage() {
  return (
    <div className="auth-container">
      <div className="surface-card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--accent-blue-light)', borderRadius: '50%', marginBottom: '1rem' }}>
            <FlaskConical size={32} color="var(--accent-blue)" />
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Welcome to LabStock</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Protect your inventory space by creating an initial administrator account.</p>
        </div>

        <form action={setupApp as any}>
          <div className="input-group">
            <label>Master Username</label>
            <input name="username" type="text" required placeholder="Choose a username" />
          </div>
          <div className="input-group">
            <label>Master Password</label>
            <input name="password" type="password" required placeholder="Choose a strong password" />
          </div>
          <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }}>
            <ShieldCheck size={18} /> Initialize System
          </button>
        </form>
      </div>
    </div>
  )
}
