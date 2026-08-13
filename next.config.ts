import type { NextConfig } from 'next'

/**
 * Two build targets share this config:
 *
 *   npm run build         — LAN server: API routes + web UI.
 *   npm run build:mobile  — static export for Capacitor (BUILD_TARGET=mobile).
 *
 * The mobile build sets `output: 'export'`, which disallows API routes,
 * server actions, cookies and proxy. That is why all data access goes through
 * the client-side backend layer in `src/lib/data`.
 */
const isMobileBuild = process.env.BUILD_TARGET === 'mobile'

const nextConfig: NextConfig = {
  ...(isMobileBuild
    ? {
        output: 'export' as const,
        distDir: '.next-mobile',
        // Capacitor serves from the filesystem, so every route needs its own
        // index.html rather than an extensionless file.
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),

  // Local network addresses permitted to reach the dev server.
  allowedDevOrigins: ['192.168.1.89', '192.168.1.78', 'localhost'],

  typescript: {
    ignoreBuildErrors: false,
  },
}

export default nextConfig
