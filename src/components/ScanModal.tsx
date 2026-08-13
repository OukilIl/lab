'use client'

/**
 * Full-screen scanner overlay used to fill a single field — currently the
 * GTIN on the new-product form. Closes as soon as a code is confirmed.
 */

import { useCallback, useEffect } from 'react'
import { CameraOff, Flashlight, X } from 'lucide-react'

import { useScanner, type ScanHit } from '@/lib/scanner/useScanner'
import { useI18n } from '@/lib/i18n/I18nProvider'

export function ScanModal({
  onDetect,
  onClose,
}: {
  /** Receives the decoded barcode; the modal closes immediately after. */
  onDetect: (hit: ScanHit) => void
  onClose: () => void
}) {
  const { t } = useI18n()

  const handleHit = useCallback(
    (hit: ScanHit) => {
      void pulse()
      onDetect(hit)
      onClose()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onDetect, onClose]
  )

  const { state, videoRef, start, stop, toggleTorch, pulse } = useScanner(handleHit)

  useEffect(() => {
    void start()
    return () => {
      void stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Escape closes, matching normal dialog behaviour on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const scanning = state.active && !state.error

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label={t('scanBarcode')}>
      <div className="modal" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-head">
          <h2>{t('scanBarcode')}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('close')}>
            <X size={18} />
          </button>
        </div>

        <div className="scanner-frame" style={{ borderRadius: 0 }}>
          <video ref={videoRef} autoPlay playsInline muted />

          {scanning && (
            <div className="scanner-overlay">
              <div className="scanner-scrim" />
              <div className="reticle">
                <span className="reticle-corner tl" />
                <span className="reticle-corner tr" />
                <span className="reticle-corner bl" />
                <span className="reticle-corner br" />
                <div className="scan-sweep" />
              </div>
              <div className="scanner-hint">{t('searching')}</div>
            </div>
          )}

          {state.torchAvailable && scanning && (
            <div className="scanner-controls">
              <button
                className="scanner-chip"
                data-on={state.torchOn}
                onClick={() => void toggleTorch()}
                aria-label="Toggle flashlight"
              >
                <Flashlight size={18} />
              </button>
            </div>
          )}

          {!scanning && (
            <div
              className="scanner-overlay"
              style={{
                display: 'grid',
                placeItems: 'center',
                background: 'var(--bg-sunken)',
                pointerEvents: 'auto',
              }}
            >
              <div className="empty">
                <div className="empty-icon">
                  {state.starting ? <span className="spinner" /> : <CameraOff size={20} />}
                </div>
                <div className="empty-title">
                  {state.starting ? t('startingCamera') : t('cameraOff')}
                </div>
                {state.error && <p className="empty-text">{state.error}</p>}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: 14 }}>
          <button className="btn btn-secondary btn-block" onClick={onClose}>
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
