import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.labstock.app',
  appName: 'LabStock',

  // `next build` with output:'export' and a custom distDir writes the static
  // HTML straight into this directory.
  webDir: '.next-mobile',

  // NOTE: `backgroundColor` is deliberately NOT set here.
  //
  // It paints the native WebView's own background, a layer beneath the page
  // that CSS cannot reach. The ML Kit scanner makes that view transparent so
  // its camera preview (which sits behind the WebView) shows through — but a
  // configured backgroundColor is reapplied over it, so the scan window shows
  // the app background instead of the camera, no matter what the CSS does.
  //
  // The launch flash it was added to hide is handled by the splash screen and
  // by the page painting its own background immediately.

  server: {
    // Android serves the bundle over http://localhost rather than file://,
    // which keeps the WebView in a secure context so the camera and crypto
    // APIs are available.
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },

  ios: {
    contentInset: 'always',
    // The document never scrolls (only .app-main does), so the WKWebView's
    // own scroll view must not either — it is what let the whole app,
    // nav bar included, drag upward and expose the background beneath.
    scrollEnabled: false,
  },

  android: {
    // Allow http:// to a LAN server. The app is intended for a trusted local
    // network where the server has no TLS certificate.
    allowMixedContent: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0ea5e9',
      showSpinner: false,
      androidSpinnerStyle: 'small',
      splashFullScreen: true,
      splashImmersive: false,
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      androidIsEncryption: false,
    },
  },
}

export default config
