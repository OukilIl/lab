#!/usr/bin/env node
/**
 * Builds the static bundle that Capacitor ships inside the native apps.
 *
 * `output: 'export'` refuses to build when route handlers are present, and
 * the API routes are server-only by definition. So they are moved aside for
 * the duration of the export and restored afterwards — including on failure
 * or if the build is interrupted.
 */

import { execSync } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = join(root, 'src', 'app', 'api')
const stashDir = join(root, '.api-stash')

let stashed = false

function restore() {
  if (stashed && existsSync(stashDir)) {
    if (existsSync(apiDir)) rmSync(apiDir, { recursive: true, force: true })
    renameSync(stashDir, apiDir)
    stashed = false
    console.log('• Restored src/app/api')
  }
}

// Restore on any exit path, including Ctrl-C, so a cancelled build never
// leaves the working tree missing its API routes.
process.on('exit', restore)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    restore()
    process.exit(1)
  })
}
process.on('uncaughtException', (error) => {
  restore()
  console.error(error)
  process.exit(1)
})

try {
  // A stash left by a previous hard kill takes precedence over whatever is
  // in place now; recover it before doing anything else.
  if (existsSync(stashDir)) {
    console.log('• Recovering an API directory stashed by an earlier run')
    if (existsSync(apiDir)) rmSync(apiDir, { recursive: true, force: true })
    renameSync(stashDir, apiDir)
  }

  if (existsSync(apiDir)) {
    renameSync(apiDir, stashDir)
    stashed = true
    console.log('• Moved src/app/api aside for the static export')
  }

  // BUILD_TARGET makes next.config.ts switch distDir to `.next-mobile`, so
  // this never overwrites the server build in `.next`. Without that
  // separation, `npm start` after a mobile build would serve a bundle with no
  // API routes and every request would 404.
  execSync('next build', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, BUILD_TARGET: 'mobile' },
  })

  // With a custom distDir, `output: 'export'` writes the HTML directly into
  // that directory rather than into `out/`. This is Capacitor's webDir.
  console.log('\n✓ Static bundle written to .next-mobile/')
  console.log(
    '  Note: this reused .next as a working directory, so the server build\n' +
      '  there no longer has API routes. Run `npm run build` (or `npm run serve`)\n' +
      '  before `npm start`, or the API will 404.'
  )
} catch (error) {
  restore()
  console.error('\n✗ Mobile build failed')
  process.exit(typeof error?.status === 'number' ? error.status : 1)
}
