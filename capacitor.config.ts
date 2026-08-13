import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.labstock.app',
  appName: 'LabStock',

  // `next build` with output:'export' and a custom distDir writes the static
  // HTML straight into this directory.
  webDir: '.next-mobile',

  // The WebView's own background, visible for a frame at launch and in any
  // overscroll gap. Default is white, which flashes against the dark UI.
  backgroundColor: '#060b16',

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
