# LabStock

Laboratory inventory tracking with live GS1 / HIBC barcode scanning. Runs as a
web app, as a native iOS app, and as a native Android app from one codebase.

## How it stores data

LabStock has two interchangeable backends, chosen on first launch and
changeable later:

| Mode | Where data lives | Sign-in | Use it when |
| --- | --- | --- | --- |
| **On this device** | SQLite on the phone | Not required — the device lock screen is the boundary | One person tracking their own stock, no network needed |
| **Shared lab server** | SQLite on a machine running `npm start` | Username + password | A team that needs one shared inventory |

Both modes run the same validation and stock arithmetic (`src/core/`), so the
numbers cannot drift between them. The UI talks only to the `DataBackend`
interface in `src/lib/data/`, so screens are identical in either mode.

## Scanning

- **Native apps** decode continuously on-device with Google ML Kit (Android)
  and Apple Vision (iOS). No network, no round trip.
- **Web** uses the camera plus ZXing on a decode loop.
- A code must be read **twice** before it is accepted — one frame is easy to
  misread on a curved vial, and a wrong GTIN books stock against the wrong
  product.
- Barcodes are parsed from raw **bytes** where available, because GS1
  DataMatrix encodes its field separator as FNC1 (`0x1d`), which string APIs
  routinely strip. Apple Vision's `payloadStringValue` does exactly this, and
  the consequence is severe: without the separator the lot field swallows the
  expiry, so a batch saves with a corrupt lot and **no expiry date at all**.
  When bytes are unavailable, the parser detects the missing separator, splits
  the fields back apart, and raises a warning so the user confirms the values
  rather than trusting an inferred boundary.
- Server mode adds an **Enhance** button: one frame is sent to a multi-pass
  server decoder (libdmtx, then ZXing at four preprocessing levels) for labels
  the live scanner cannot resolve.

Supported: GS1 DataMatrix, HIBC (EU IVDR / UDI), QR, Code 128, Code 39,
EAN-8/13, ITF.

## Getting started

```bash
npm install
cp .env.example .env
# Generate a signing secret — the server refuses to start without one:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste it into JWT_SECRET in .env

npx prisma generate
npx prisma db push

npm run dev            # http://localhost:3000
```

### Running a shared server for phones on the same Wi-Fi

```bash
npm run build
npm run start -- -H 0.0.0.0
```

Find the host's LAN address (`ipconfig getifaddr en0` on macOS) and enter
`192.168.x.x:3000` in the app's onboarding screen.

The first account is created from the app the first time it connects.

## Building the mobile apps

```bash
npm run ios          # builds, syncs, opens Xcode
npm run android      # builds, syncs, opens Android Studio
```

Then press Run in the IDE. Android produces a real `.apk`/`.aab`; Xcode
produces a real `.ipa`. Installing on a physical iPhone needs a signing team
selected in Xcode (a free Apple ID gives 7-day builds).

To rebuild the web bundle into the native projects without opening an IDE:

```bash
npm run sync
```

### Why the mobile build is separate

Capacitor ships a static bundle, and `output: 'export'` forbids API routes,
server actions, cookies and proxy. `scripts/build-mobile.mjs` therefore moves
`src/app/api/` aside for the duration of the export and restores it afterwards
(including on Ctrl-C). That is also why all data access goes through the
client-side backend layer rather than server actions.

> **Build order matters.** A mobile build reuses `.next` as its working
> directory, so afterwards `.next` no longer contains API routes. Running
> `npm start` at that point serves the app but every API call 404s. Run
> `npm run build` first, or just use `npm run serve`, which does both.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run dev:lan` | Dev server bound to all interfaces, for phone testing |
| `npm run build` / `npm start` | Production server build (web UI + API) |
| `npm run serve` | Rebuild the server target and start it — safe after a mobile build |
| `npm run build:mobile` | Static export into `.next-mobile/` for Capacitor |
| `npm run sync` | Mobile build + copy into `ios/` and `android/` |
| `npm run ios` / `npm run android` | Sync and open the native IDE |
| `npm test` | Parser and domain unit tests |
| `npm run test:images` | Decode real barcode images and assert the fields |
| `npm run test:e2e` | API tests against a running server |
| `npm run typecheck` | TypeScript, app and tests |
| `npm run lint` | ESLint |

## Testing

`npm test` covers the barcode parser and inventory logic (45 tests), including
regression cases for GS1 strings that the previous parser decoded into wrong
expiry dates.

`npm run test:images` decodes real barcode PNGs in `test-fixtures/` through the
full pipeline — binarisation, ZXing/libdmtx, byte handling — and asserts the
extracted fields. This catches problems the string-level unit tests cannot,
notably FNC1 separators being lost during decoding. Regenerate the fixtures
with:

```bash
swift scripts/make-fixtures.swift test-fixtures
```

Two helpers support manual investigation:

```bash
# Decode any image (e.g. a photo of a real label) and show parsed fields
node --experimental-strip-types scripts/decode-image.mjs path/to/photo.jpg

# Degrade a clean barcode into 10 realistic camera conditions
node scripts/make-realistic.mjs test-fixtures/gs1-qr-serial.png out/
```

The realistic corpus (motion blur, low light, glare, off-axis perspective,
sensor noise, JPEG artefacts, distance, rotation, and a combined worst case)
currently decodes at 50/50 with all fields exact.

`npm run test:e2e` needs a running server and checks authentication,
validation, and the two concurrency-sensitive paths — restock accounting and
simultaneous usage logging:

```bash
DATABASE_URL="file:/tmp/labstock-test.db" npx prisma db push
DATABASE_URL="file:/tmp/labstock-test.db" npm start &
npm run test:e2e
```

## Layout

```
src/
├── core/                 # Pure domain logic — no I/O, runs everywhere
│   ├── barcode.ts        # GS1 + HIBC parsing
│   ├── inventory.ts      # Stock, expiry, validation
│   └── *.test.ts
├── lib/
│   ├── data/             # Backend abstraction
│   │   ├── local.ts      # On-device SQLite
│   │   ├── remote.ts     # HTTP to a lab server
│   │   └── BackendProvider.tsx
│   ├── scanner/          # Camera + decode loop
│   ├── server/           # Server-only: Prisma service, API helpers
│   └── auth.ts           # JWT signing and verification
├── app/
│   ├── api/              # REST API (server build only)
│   └── (dashboard)/      # Screens
└── components/           # Shared UI
```

## Security notes

- `JWT_SECRET` is mandatory; the server refuses to start without one of at
  least 32 characters. There is no fallback.
- Every API route verifies the token per request. Authorisation is not done at
  the network edge, because an edge check can be bypassed and cannot run in a
  static export at all.
- Plaintext HTTP is permitted only to private LAN ranges (see
  `android/.../network_security_config.xml` and `NSAllowsLocalNetworking`).
  Public hosts still require HTTPS.
- Intended for a trusted local network. Do not expose the server directly to
  the internet without a TLS-terminating reverse proxy.

## Optional

`dmtxread` (from `libdmtx`) improves server-side decoding of damaged
DataMatrix labels. It is optional — the decoder skips that pass if the binary
is absent.

```bash
brew install dmtx-utils
```
