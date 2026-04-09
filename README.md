# LabStock

LabStock is a professional, local-first laboratory inventory management system designed for medical and research environments. It provides a centralized database for tracking stock levels, expiration dates, and usage logs with a primary focus on ease of use and mobile-first barcode scanning.

## Core Features

- Dashboard Overview: Real-time visibility into total inventory units and urgent action items via a clean interface.
- GS1 DataMatrix Scanning: Built-in support for decoding GS1 standard barcodes, automatically extracting GTIN, Batch Numbers, and Expiration Dates.
- Automated Warnings: Proactive alerts for low stock levels based on customizable thresholds and upcoming item expirations.
- Usage Logging: Precise tracking of item consumption to maintain accurate inventory counts.
- Mobile-First Design: Optimized user interface for handheld devices to facilitate in-the-field scanning and inventory audits.
- Local Network Access: Designed to run on a local server while allowing mobile devices on the same Wi-Fi network to participate in scanning.

## Technical Architecture

The application is built using a modern, robust tech stack:

- Framework: Next.js with App Router.
- Database: SQLite for a lightweight, zero-configuration local-first experience.
- ORM: Prisma for type-safe database access and migrations.
- Authentication: JWT-based session management using jose and bcryptjs.
- Barcode Processing: Integrated html5-qrcode for browser-based scanning.
- Styling: Custom vanilla CSS with a premium minimalist aesthetic.

## Installation and Setup

### Prerequisites

- Node.js (Latest LTS version recommended)
- npm

### Configuration

1. Clone the repository to the host machine.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Initialize the database:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
4. Create a `.env` file in the root directory and configure the database URL:
   ```env
   DATABASE_URL="file:./dev.db"
   JWT_SECRET="your_secure_secret_here"
   ```

### Running Locally

To start the development server:
```bash
npm run dev
```

The application will be accessible at http://localhost:3000.

### Network Access for Mobile Scanning

To allow mobile devices on your network to access the scanner:
1. Identify the host machine's local IP address (e.g., 192.168.1.89).
2. Update the `allowedDevOrigins` and `serverActions.allowedOrigins` in `next.config.ts` with your local IP.
3. Start the server bound to all interfaces:
   ```bash
   npm run dev -- -H 0.0.0.0
   ```
4. Access the app on mobile via `http://[YOUR_IP]:3000`.

## User Management

The first user to access the application will be prompted to create an Administrator account. This account has full control over product registration and inventory monitoring.

## Security Note

This application is designed for local network deployment. Ensure your local network is secured and do not expose the development server directly to the public internet without proper proxy and SSL configurations.
