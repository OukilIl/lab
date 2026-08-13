/**
 * SQL schema for the on-device database.
 *
 * Mirrors `prisma/schema.prisma` so that a local database and a server
 * database describe the same domain. Kept as plain SQL because Prisma
 * cannot run inside the mobile WebView.
 */

export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS products (
     id                     TEXT PRIMARY KEY NOT NULL,
     gtin                   TEXT NOT NULL UNIQUE,
     name                   TEXT NOT NULL,
     targetStock            INTEGER NOT NULL DEFAULT 100,
     lowStockThresholdPct   INTEGER NOT NULL DEFAULT 20,
     expirationWarningDays  INTEGER NOT NULL DEFAULT 30
   )`,

  `CREATE TABLE IF NOT EXISTS inventory_batches (
     id              TEXT PRIMARY KEY NOT NULL,
     gtin            TEXT NOT NULL,
     batchNumber     TEXT NOT NULL,
     expirationDate  TEXT NOT NULL,
     addedDate       TEXT NOT NULL,
     initialQuantity INTEGER NOT NULL,
     currentQuantity INTEGER NOT NULL,
     producer        TEXT,
     notes           TEXT,
     UNIQUE (gtin, batchNumber),
     FOREIGN KEY (gtin) REFERENCES products (gtin) ON DELETE CASCADE
   )`,

  `CREATE TABLE IF NOT EXISTS usage_logs (
     id               TEXT PRIMARY KEY NOT NULL,
     userId           TEXT,
     userName         TEXT,
     inventoryBatchId TEXT NOT NULL,
     quantityUsed     INTEGER NOT NULL,
     date             TEXT NOT NULL,
     FOREIGN KEY (inventoryBatchId) REFERENCES inventory_batches (id) ON DELETE CASCADE
   )`,

  `CREATE INDEX IF NOT EXISTS idx_batches_gtin ON inventory_batches (gtin)`,
  `CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches (expirationDate)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_batch ON usage_logs (inventoryBatchId)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_logs (date)`,
]

/** Bumped when the schema changes, for future migrations. */
export const SCHEMA_VERSION = 1

export const DB_NAME = 'labstock'
