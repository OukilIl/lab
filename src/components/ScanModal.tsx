'use client'

/**
 * Full-screen scanner used to fill a single field — currently the GTIN on the
 * new-product form. Closes as soon as a code is confirmed.
 *
 * Deliberately not a card floating inside a dialog: on native the ML Kit
 * preview renders *behind the whole WebView*, so it cannot be clipped to a
 * small box sitting on top of it. Instead this takes over the screen exactly
 * like the Scan tab — an opaque surround with a transparent window — which is
 * both what works and what the user already recognises.
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
    <div className="scan-sheet" role="dialog" aria-modal="true" aria-label={t('scanBarcode')}>
      <div className="scanner-frame scan-sheet-frame">
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

        {!scanning && (
          <div className="scanner-overlay scanner-placeholder">
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

      {/* Controls float above the viewfinder. */}
      <div className="scan-sheet-bar scan-sheet-top">
        <span className="scan-sheet-title">{t('scanBarcode')}</span>
        <div className="row" style={{ gap: 8 }}>
          {state.torchAvailable && scanning && (
            <button
              className="scanner-chip"
              data-on={state.torchOn}
              onClick={() => void toggleTorch()}
              aria-label="Toggle flashlight"
            >
              <Flashlight size={18} />
            </button>
          )}
          <button className="scanner-chip" onClick={onClose} aria-label={t('close')}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="scan-sheet-bar scan-sheet-bottom">
        <button className="btn btn-secondary btn-block" onClick={onClose}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
