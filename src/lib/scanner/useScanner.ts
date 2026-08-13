'use client'

/**
 * Continuous barcode scanning.
 *
 * Native (iOS/Android): ML Kit via `@capacitor-mlkit/barcode-scanning`, which
 * renders the camera preview *behind* the WebView and streams decode events.
 * Web: getUserMedia into a canvas, decoded with ZXing on an animation loop.
 *
 * Both paths emit the same `ScanHit`, so the UI does not branch on platform.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { parseBarcode, type ParsedBarcode } from '@/core/barcode'

export type ScannerEngine = 'mlkit' | 'web' | 'none'

export interface ScanHit {
  parsed: ParsedBarcode
  /** Symbology reported by the decoder, e.g. `DATA_MATRIX`. */
  symbology: string
  engine: ScannerEngine
}

export interface ScannerState {
  engine: ScannerEngine
  active: boolean
  starting: boolean
  error: string | null
  permissionDenied: boolean
  torchAvailable: boolean
  torchOn: boolean
}

/**
 * A decoded symbol must be seen twice before it counts.
 *
 * A single frame is easy to misread on a curved vial or a partially occluded
 * label, and a wrong GTIN silently books stock against the wrong product.
 */
const CONFIRMATIONS_REQUIRED = 2

/** Ignore repeats of the same code for this long after a successful scan. */
const DUPLICATE_COOLDOWN_MS = 2500

/** Web decode cadence; ~8/s is responsive without pinning a phone CPU. */
const WEB_DECODE_INTERVAL_MS = 120

/**
 * ML Kit reports raw bytes as well as a display string. GS1 DataMatrix
 * encodes FNC1 as 0x1d, which `displayValue` frequently strips — parsing the
 * bytes preserves the separators the GS1 grammar depends on.
 */
function textFromBarcode(barcode: { rawValue?: string; displayValue?: string; bytes?: number[] }): string {
  if (barcode.bytes && barcode.bytes.length > 0) {
    let text = ''
    for (const byte of barcode.bytes) text += String.fromCharCode(byte)
    // Trust the byte payload only when it carries a separator or matches the
    // string form; some devices report a length-prefixed envelope instead.
    if (text.includes('\x1d') || text === barcode.rawValue) return text
  }
  return barcode.rawValue ?? barcode.displayValue ?? ''
}

export function useScanner(onHit: (hit: ScanHit) => void) {
  const [state, setState] = useState<ScannerState>({
    engine: 'none',
    active: false,
    starting: false,
    error: null,
    permissionDenied: false,
    torchAvailable: false,
    torchOn: false,
  })

  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Refs so the decode loop never restarts on re-render.
  const onHitRef = useRef(onHit)
  onHitRef.current = onHit

  const activeRef = useRef(false)
  /**
   * The user's *intent*, flipped synchronously by start()/stop().
   *
   * Starting the native scanner takes several awaits (permissions, module
   * install, startScan). If the user navigates away mid-flight, stop() runs
   * before startScan resolves — and the camera then comes up *after* the
   * page has changed, leaving every other screen transparent over a live
   * feed. Each await checks this flag and unwinds if intent has flipped.
   */
  const wantActiveRef = useRef(false)
  const listenerRef = useRef<{ remove: () => Promise<void> } | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const readerRef = useRef<unknown>(null)

  const candidateRef = useRef<{ text: string; count: number }>({ text: '', count: 0 })
  const lastAcceptedRef = useRef<{ text: string; at: number }>({ text: '', at: 0 })

  /** Shared gate: confirmation streak plus duplicate cooldown. */
  const considerCandidate = useCallback((text: string, symbology: string, engine: ScannerEngine) => {
    if (!text) return

    const now = Date.now()
    if (
      text === lastAcceptedRef.current.text &&
      now - lastAcceptedRef.current.at < DUPLICATE_COOLDOWN_MS
    ) {
      return
    }

    if (candidateRef.current.text === text) {
      candidateRef.current.count += 1
    } else {
      candidateRef.current = { text, count: 1 }
    }

    if (candidateRef.current.count < CONFIRMATIONS_REQUIRED) return

    candidateRef.current = { text: '', count: 0 }
    lastAcceptedRef.current = { text, at: now }

    onHitRef.current({ parsed: parseBarcode(text), symbology, engine })
  }, [])

  const stop = useCallback(async () => {
    wantActiveRef.current = false
    activeRef.current = false
    // Synchronously, before any await: an in-flight start() must never leave
    // the page transparent after the user has moved on.
    document.documentElement.classList.remove('scanner-active')
    document.body.classList.remove('scanner-active')

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    if (listenerRef.current) {
      await listenerRef.current.remove().catch(() => {})
      listenerRef.current = null
    }

    try {
      const { Capacitor } = await import('@capacitor/core')
      if (Capacitor.isNativePlatform()) {
        const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
        await BarcodeScanner.stopScan().catch(() => {})
      }
    } catch {
      /* ignore */
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null

    candidateRef.current = { text: '', count: 0 }
    setState((s) => ({ ...s, active: false, starting: false, torchOn: false }))
  }, [])

  const startNative = useCallback(async (): Promise<boolean> => {
    const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning')

    const supported = await BarcodeScanner.isSupported()
    if (!supported.supported) return false

    const permission = await BarcodeScanner.requestPermissions()
    if (permission.camera !== 'granted' && permission.camera !== 'limited') {
      setState((s) => ({
        ...s,
        starting: false,
        permissionDenied: true,
        error: 'Camera access is required to scan. Enable it in Settings.',
      }))
      return true // handled: do not fall through to the web engine
    }

    // On Android the ML Kit scanner module ships separately and may need
    // a one-time install before the first scan.
    try {
      const available = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
      if (!available.available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule()
      }
    } catch {
      // Not available on iOS, and non-fatal on Android.
    }

    // Intent may have flipped during the permission/install awaits above.
    if (!wantActiveRef.current) return true

    listenerRef.current = await BarcodeScanner.addListener('barcodesScanned', (event) => {
      if (!activeRef.current) return
      for (const barcode of event.barcodes) {
        considerCandidate(textFromBarcode(barcode), String(barcode.format), 'mlkit')
      }
    })

    // The camera preview renders behind the WebView, so every layer from the
    // document root down must be transparent for it to be visible.
    document.documentElement.classList.add('scanner-active')
    document.body.classList.add('scanner-active')

    await BarcodeScanner.startScan({
      formats: [
        BarcodeFormat.DataMatrix,
        BarcodeFormat.QrCode,
        BarcodeFormat.Code128,
        BarcodeFormat.Code39,
        BarcodeFormat.Ean13,
        BarcodeFormat.Ean8,
        BarcodeFormat.Itf,
        BarcodeFormat.UpcA,
        BarcodeFormat.UpcE,
      ],
    })

    // The user navigated away while the camera was spinning up: unwind
    // everything startScan just set in motion.
    if (!wantActiveRef.current) {
      await BarcodeScanner.stopScan().catch(() => {})
      await listenerRef.current?.remove().catch(() => {})
      listenerRef.current = null
      document.documentElement.classList.remove('scanner-active')
      document.body.classList.remove('scanner-active')
      return true
    }

    let torchAvailable = false
    try {
      torchAvailable = (await BarcodeScanner.isTorchAvailable()).available
    } catch {
      /* ignore */
    }

    activeRef.current = true
    setState({
      engine: 'mlkit',
      active: true,
      starting: false,
      error: null,
      permissionDenied: false,
      torchAvailable,
      torchOn: false,
    })
    return true
  }, [considerCandidate])

  const startWeb = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState((s) => ({
        ...s,
        starting: false,
        error: 'This browser cannot access the camera. Try Chrome or Safari over HTTPS.',
      }))
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
    } catch (e) {
      const denied = e instanceof DOMException && e.name === 'NotAllowedError'
      setState((s) => ({
        ...s,
        starting: false,
        permissionDenied: denied,
        error: denied
          ? 'Camera access was denied. Allow it in your browser settings and try again.'
          : 'No camera is available on this device.',
      }))
      return
    }

    // getUserMedia can take seconds; the user may already be elsewhere.
    if (!wantActiveRef.current) {
      for (const track of stream.getTracks()) track.stop()
      return
    }

    streamRef.current = stream
    const video = videoRef.current
    if (!video) {
      for (const track of stream.getTracks()) track.stop()
      return
    }

    video.srcObject = stream
    try {
      await video.play()
    } catch {
      // Autoplay can reject; the element is muted+playsInline so this is rare.
    }

    const capabilities = stream.getVideoTracks()[0]?.getCapabilities?.() as
      | (MediaTrackCapabilities & { torch?: boolean })
      | undefined

    // The core reader plus a hand-built bitmap, rather than
    // BrowserMultiFormatReader: we own the camera stream and the crop, and
    // the wrapper offers no canvas-decode entry point.
    const {
      MultiFormatReader,
      DecodeHintType,
      BarcodeFormat: ZXingFormat,
      RGBLuminanceSource,
      HybridBinarizer,
      BinaryBitmap,
    } = await import('@zxing/library')

    const reader = new MultiFormatReader()
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      ZXingFormat.DATA_MATRIX,
      ZXingFormat.QR_CODE,
      ZXingFormat.CODE_128,
      ZXingFormat.CODE_39,
      ZXingFormat.EAN_13,
      ZXingFormat.EAN_8,
      ZXingFormat.ITF,
    ])
    // TRY_HARDER is deliberately off here: this runs every frame, and the
    // exhaustive search costs more than it gains on a live feed.
    reader.setHints(hints)
    readerRef.current = reader

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    activeRef.current = true
    setState({
      engine: 'web',
      active: true,
      starting: false,
      error: null,
      permissionDenied: false,
      torchAvailable: Boolean(capabilities?.torch),
      torchOn: false,
    })

    let lastDecode = 0

    const loop = (timestamp: number) => {
      if (!activeRef.current) return
      rafRef.current = requestAnimationFrame(loop)

      if (timestamp - lastDecode < WEB_DECODE_INTERVAL_MS) return
      lastDecode = timestamp

      if (!ctx || video.readyState < 2 || !video.videoWidth) return

      // Decode only the central region: it is where users aim, and a smaller
      // bitmap keeps the loop cheap enough to run continuously.
      const cropRatio = 0.62
      const size = Math.min(video.videoWidth, video.videoHeight) * cropRatio
      const sx = (video.videoWidth - size) / 2
      const sy = (video.videoHeight - size) / 2

      canvas.width = Math.round(size)
      canvas.height = Math.round(size)
      ctx.drawImage(video, sx, sy, size, size, 0, 0, canvas.width, canvas.height)

      try {
        const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
        // getImageData returns a fresh RGBA buffer that exactly fits the view,
        // so it can be wrapped directly.
        const source = new RGBLuminanceSource(
          new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
          width,
          height
        )
        const result = reader.decode(new BinaryBitmap(new HybridBinarizer(source)))
        considerCandidate(result.getText(), ZXingFormat[result.getBarcodeFormat()] ?? 'UNKNOWN', 'web')
      } catch {
        // NotFoundException on most frames; expected.
      } finally {
        // The reader caches per-decode state between calls.
        reader.reset()
      }
    }

    rafRef.current = requestAnimationFrame(loop)
  }, [considerCandidate])

  const start = useCallback(async () => {
    if (activeRef.current || wantActiveRef.current) return
    wantActiveRef.current = true
    setState((s) => ({ ...s, starting: true, error: null, permissionDenied: false }))

    try {
      const { Capacitor } = await import('@capacitor/core')
      if (Capacitor.isNativePlatform()) {
        const handled = await startNative()
        if (handled) return
      }
      await startWeb()
    } catch (e) {
      setState((s) => ({
        ...s,
        starting: false,
        error: e instanceof Error ? e.message : 'The camera could not be started',
      }))
    } finally {
      // If the camera did not actually come up (denied, failed, or aborted),
      // clear the intent so the retry button can start over.
      if (!activeRef.current) wantActiveRef.current = false
    }
  }, [startNative, startWeb])

  const toggleTorch = useCallback(async () => {
    try {
      const { Capacitor } = await import('@capacitor/core')

      if (Capacitor.isNativePlatform()) {
        const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
        const enabled = (await BarcodeScanner.isTorchEnabled()).enabled
        if (enabled) await BarcodeScanner.disableTorch()
        else await BarcodeScanner.enableTorch()
        setState((s) => ({ ...s, torchOn: !enabled }))
        return
      }

      const track = streamRef.current?.getVideoTracks()[0]
      if (!track) return
      const next = !state.torchOn
      // `torch` is a real constraint in Chrome/Android but is absent from the
      // standard DOM typings, so the shape is asserted through `unknown`.
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints)
      setState((s) => ({ ...s, torchOn: next }))
    } catch {
      setState((s) => ({ ...s, torchAvailable: false }))
    }
  }, [state.torchOn])

  /** Success feedback: a short haptic tap, falling back to vibration. */
  const pulse = useCallback(async () => {
    try {
      const { Capacitor } = await import('@capacitor/core')
      if (Capacitor.isNativePlatform()) {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
        await Haptics.impact({ style: ImpactStyle.Medium })
        return
      }
    } catch {
      /* fall through */
    }
    try {
      navigator.vibrate?.(60)
    } catch {
      /* not supported */
    }
  }, [])

  // Always release the camera when the component unmounts.
  useEffect(() => {
    return () => {
      void stop()
    }
  }, [stop])

  // Release it when the app is backgrounded, so the OS does not kill us and
  // the camera indicator does not stay lit.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && activeRef.current) void stop()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [stop])

  return { state, videoRef, start, stop, toggleTorch, pulse }
}
