'use client'

/** Small presentational primitives shared across screens. */

import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type Tone = 'ok' | 'warn' | 'danger' | 'info'

const TONE_ICON: Record<Tone, LucideIcon> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  danger: XCircle,
  info: Info,
}

export function Alert({
  tone,
  children,
  action,
}: {
  tone: Tone
  children: ReactNode
  action?: ReactNode
}) {
  const Icon = TONE_ICON[tone]
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={17} className="alert-icon" aria-hidden />
      <div className="alert-body">
        {children}
        {action ? <div style={{ marginTop: 10 }}>{action}</div> : null}
      </div>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={21} aria-hidden />
      </div>
      <div className="empty-title">{title}</div>
      {children ? <p className="empty-text">{children}</p> : null}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="spinner" aria-hidden />
      {label ? <span className="text-sm text-secondary">{label}</span> : null}
      <span className="sr-only">Loading</span>
    </span>
  )
}

export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="centered-screen">
      <Spinner label={label} />
    </div>
  )
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card card-pad stack stack-3" aria-hidden>
      <div className="skeleton" style={{ height: 15, width: '42%' }} />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 11, width: `${88 - i * 13}%` }} />
      ))}
    </div>
  )
}

/** Expiry pill whose colour tracks urgency. */
export function ExpiryBadge({ days }: { days: number }) {
  const tone = days < 0 ? 'danger' : days <= 7 ? 'danger' : days <= 30 ? 'warn' : 'neutral'
  const label =
    days < 0
      ? days === -1
        ? 'Expired yesterday'
        : `Expired ${Math.abs(days)}d ago`
      : days === 0
        ? 'Expires today'
        : days === 1
          ? 'Tomorrow'
          : `${days}d left`

  return <span className={`badge badge-${tone} numeric`}>{label}</span>
}
