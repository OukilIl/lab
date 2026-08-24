/**
 * On-device storage backend.
 *
 * Uses `@capacitor-community/sqlite`, which maps to native SQLite on iOS and
 * Android and to a sql.js/IndexedDB implementation in the browser. All access
 * goes through `run`/`query` so the two paths stay identical.
 */

import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'

import { buildDashboard, groupBatches, validateBatch, validateProduct } from '@/core/inventory'
import { err, ok } from '@/core/types'
import type {
  DashboardData,
  InventoryBatch,
  NewBatchInput,
  NewProductInput,
  Product,
  ProductWithBatches,
  Result,
  UsageLogEntry,
} from '@/core/types'
import { DB_NAME, MIGRATION_STATEMENTS, SCHEMA_STATEMENTS, SCHEMA_VERSION } from './schema-sql'
import type { DataBackend, SessionUser } from './types'

/**
 * Module-level connection shared by every LocalBackend instance.
 *
 * The native plugin registers connections globally, but each JS
 * `SQLiteConnection` wrapper keeps its own registry. Creating a fresh backend
 * (logout, settings change, retry) with a fresh wrapper made
 * `createConnection` throw "Connection labstock already exists", because the
 * native side still held the old one. One shared wrapper + one shared db
 * connection removes the mismatch entirely.
 */
let sharedSqlite: SQLiteConnection | null = null
let sharedDb: SQLiteDBConnection | null = null
let sharedDbPromise: Promise<SQLiteDBConnection> | null = null

async function openSharedDatabase(): Promise<SQLiteDBConnection> {
  if (sharedDb) return sharedDb
  // Serialise concurrent opens (several screens init on first paint).
  if (!sharedDbPromise) {
    sharedDbPromise = (async () => {
      if (!sharedSqlite) sharedSqlite = new SQLiteConnection(CapacitorSQLite)
      const sqlite = sharedSqlite

      // The web build needs the sql.js worker mounted before any connection.
      if (Capacitor.getPlatform() === 'web') {
        if (!document.querySelector('jeep-sqlite')) {
          document.body.appendChild(document.createElement('jeep-sqlite'))
          await customElements.whenDefined('jeep-sqlite')
        }
        await sqlite.initWebStore()
      }

      // Reconcile the JS registry with the native plugin's: after a WebView
      // reload the native connection can outlive every JS wrapper.
      const consistency = await sqlite
        .checkConnectionsConsistency()
        .catch(() => ({ result: false }))
      const existing = (await sqlite.isConnection(DB_NAME, false)).result

      let db: SQLiteDBConnection
      if (consistency.result && existing) {
        db = await sqlite.retrieveConnection(DB_NAME, false)
      } else {
        try {
          db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', SCHEMA_VERSION, false)
        } catch (e) {
          // Belt and braces: if the native side still reports the connection,
          // adopt it rather than failing the whole app.
          if (e instanceof Error && e.message.includes('already exists')) {
            db = await sqlite.retrieveConnection(DB_NAME, false)
          } else {
            throw e
          }
        }
      }

      const open = await db.isDBOpen().catch(() => ({ result: false }))
      if (!open.result) await db.open()

      sharedDb = db
      return db
    })().catch((e) => {
      // Reset so a retry starts clean instead of reusing a rejected promise.
      sharedDbPromise = null
      throw e
    })
  }
  return sharedDbPromise
}

function newId(): string {
  // `crypto.randomUUID` needs a secure context; Capacitor's WebView qualifies,
  // but fall back for plain http:// LAN access in a desktop browser.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export class LocalBackend implements DataBackend {
  readonly mode = 'local' as const

  private db: SQLiteDBConnection | null = null
  private initPromise: Promise<Result<void>> | null = null

  async init(): Promise<Result<void>> {
    // Guard against concurrent initialisation from multiple screens.
    if (!this.initPromise) this.initPromise = this.doInit()
    return this.initPromise
  }

  private async doInit(): Promise<Result<void>> {
    try {
      this.db = await openSharedDatabase()

      for (const statement of SCHEMA_STATEMENTS) {
        await this.db.execute(statement)
      }

      // Additive migrations for databases created before these columns
      // existed. Each failure is a "duplicate column" on an already-migrated
      // database, which is the expected no-op.
      for (const statement of MIGRATION_STATEMENTS) {
        try {
          await this.db.execute(statement)
        } catch {
          /* column already present */
        }
      }
      await this.db.execute('PRAGMA foreign_keys = ON')

      return ok(undefined)
    } catch (e) {
      this.initPromise = null // allow a retry
      return err(
        `Could not open the on-device database: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  private async conn(): Promise<SQLiteDBConnection> {
    if (!this.db) {
      const res = await this.init()
      if (!res.ok) throw new Error(res.error)
    }
    if (!this.db) throw new Error('Database unavailable')
    return this.db
  }

  private async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await this.conn()
    const res = await db.query(sql, params as never[])
    return (res.values ?? []) as T[]
  }

  private async run(sql: string, params: unknown[] = []): Promise<void> {
    const db = await this.conn()
    await db.run(sql, params as never[])
  }

  /** Persist the web store; a no-op on native platforms. */
  private async persist(): Promise<void> {
    if (Capacitor.getPlatform() === 'web' && sharedSqlite) {
      try {
        await sharedSqlite.saveToStore(DB_NAME)
      } catch {
        // Non-fatal: data is still in memory for this session.
      }
    }
  }

  // Local mode is single-user; the device lock screen is the boundary.
  async getCurrentUser(): Promise<SessionUser | null> {
    return null
  }

  async login(): Promise<Result<SessionUser>> {
    return err('Sign-in is not used in on-device mode')
  }

  async logout(): Promise<void> {
    /* nothing to clear */
  }

  async listProducts(): Promise<Result<ProductWithBatches[]>> {
    try {
      const products = await this.query<Product>(
        `SELECT id, gtin, name, brand, supplier, storageTemp,
                targetStock, lowStockThresholdPct, expirationWarningDays
         FROM products ORDER BY name COLLATE NOCASE ASC`
      )
      const batches = await this.query<InventoryBatch>(
        `SELECT id, gtin, batchNumber, expirationDate, addedDate,
                initialQuantity, currentQuantity, producer, notes
         FROM inventory_batches ORDER BY expirationDate ASC`
      )
      return ok(groupBatches(products, batches))
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Could not read products')
    }
  }

  async getProduct(gtin: string): Promise<Result<ProductWithBatches | null>> {
    try {
      const rows = await this.query<Product>(
        `SELECT id, gtin, name, brand, supplier, storageTemp,
                targetStock, lowStockThresholdPct, expirationWarningDays
         FROM products WHERE gtin = ?`,
        [gtin]
      )
      if (rows.length === 0) return ok(null)

      const batches = await this.query<InventoryBatch>(
        `SELECT id, gtin, batchNumber, expirationDate, addedDate,
                initialQuantity, currentQuantity, producer, notes
         FROM inventory_batches WHERE gtin = ? ORDER BY expirationDate ASC`,
        [gtin]
      )
      return ok({ ...rows[0], batches })
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Could not read product')
    }
  }

  async getDashboard(): Promise<Result<DashboardData>> {
    const res = await this.listProducts()
    if (!res.ok) return res
    return ok(buildDashboard(res.data))
  }

  async createProduct(input: NewProductInput): Promise<Result<Product>> {
    const invalid = validateProduct(input)
    if (invalid) return err(invalid, 'VALIDATION')

    try {
      const existing = await this.query<{ id: string }>(
        'SELECT id FROM products WHERE gtin = ?',
        [input.gtin]
      )
      if (existing.length > 0) {
        return err('A product with this GTIN already exists.', 'DUPLICATE')
      }

      const product: Product = {
        id: newId(),
        gtin: input.gtin.trim(),
        name: input.name.trim(),
        brand: input.brand?.trim() || null,
        supplier: input.supplier?.trim() || null,
        storageTemp: input.storageTemp ?? null,
        targetStock: input.targetStock,
        lowStockThresholdPct: input.lowStockThresholdPct,
        expirationWarningDays: input.expirationWarningDays,
      }
      await this.run(
        `INSERT INTO products
           (id, gtin, name, brand, supplier, storageTemp,
            targetStock, lowStockThresholdPct, expirationWarningDays)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.id,
          product.gtin,
          product.name,
          product.brand,
          product.supplier,
          product.storageTemp,
          product.targetStock,
          product.lowStockThresholdPct,
          product.expirationWarningDays,
        ]
      )
      await this.persist()
      return ok(product)
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Could not create product')
    }
  }

  async updateProduct(id: string, input: Partial<NewProductInput>): Promise<Result<Product>> {
    try {
      const rows = await this.query<Product>(
        `SELECT id, gtin, name, brand, supplier, storageTemp,
                targetStock, lowStockThresholdPct, expirationWarningDays
         FROM products WHERE id = ?`,
        [id]
      )
      if (rows.length === 0) return err('Product not found', 'NOT_FOUND')

      const merged = { ...rows[0], ...input }
      const invalid = validateProduct(merged)
      if (invalid) return err(invalid, 'VALIDATION')

      await this.run(
        `UPDATE products
            SET name = ?, brand = ?, supplier = ?, storageTemp = ?,
                targetStock = ?, lowStockThresholdPct = ?, expirationWarningDays = ?
          WHERE id = ?`,
        [
          merged.name.trim(),
          merged.brand?.trim() || null,
          merged.supplier?.trim() || null,
          merged.storageTemp ?? null,
          merged.targetStock,
          merged.lowStockThresholdPct,
          merged.expirationWarningDays,
          id,
        ]
      )
      await this.persist()
      return ok(merged)
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Could not update product')
    }
  }

  async deleteProduct(id: string): Promise<Result<void>> {
    try {
      await this.run('DELETE FROM products WHERE id = ?', [id])
      await this.persist()
      return ok(undefined)
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Could not delete product')
    }
  }

  async addBatch(input: NewBatchInput): Promise<Result<InventoryBatch>> {
    const invalid = validateBatch(input)
    if (invalid) return err(invalid, 'VALIDATION')

    try {
      const product = await this.query<{ gtin: string }>(
        'SELECT gtin FROM products WHERE gtin = ?',
        [input.gtin]
      )
      if (product.length === 0) {
        return err(
          'No product is registered for this GTIN. Create the product first.',
          'PRODUCT_NOT_FOUND'
        )
      }

      const batchNumber = input.batchNumber.trim()
      const existing = await this.query<InventoryBatch>(
        `SELECT id, gtin, batchNumber, expirationDate, addedDate,
                initialQuantity, currentQuantity, producer, notes
         FROM inventory_batches WHERE gtin = ? AND batchNumber = ?`,
        [input.gtin, batchNumber]
      )

      if (existing.length > 0) {
        const prev = existing[0]
        // Restocking an existing batch adds to the current count. initialQuantity
        // is the historical baseline and must not be rewritten, otherwise
        // consumption over the batch's life becomes unrecoverable.
        await this.run(
          'UPDATE inventory_batches SET currentQuantity = currentQuantity + ? WHERE id = ?',
          [input.quantity, prev.id]
        )
        await this.persist()
        return ok({ ...prev, currentQuantity: prev.currentQuantity + input.quantity })
      }

      const batch: InventoryBatch = {
        id: newId(),
        gtin: input.gtin,
        batchNumber,
        expirationDate: input.expirationDate,
        addedDate: new Date().toISOString(),
        initialQuantity: input.quantity,
        currentQuantity: input.quantity,
        producer: input.producer?.trim() || null,
        notes: input.notes?.trim() || null,
      }

      await this.run(
        `INSERT INTO inventory_batches
           (id, gtin, batchNumber, expirationDate, addedDate,
            initialQuantity, currentQuantity, producer, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batch.id,
          batch.gtin,
          batch.batchNumber,
          batch.expirationDate,
          batch.addedDate,
          batch.initialQuantity,
          batch.currentQuantity,
          batch.producer,
          batch.notes,
        ]
      )
      await this.persist()
      return ok(batch)
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Could not add batch')
    }
  }

  async logUsage(batchId: string, quantity: number): Promise<Result<InventoryBatch>> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      return err('Quantity must be a whole number of at least 1', 'VALIDATION')
    }

    try {
      // Conditional UPDATE: the stock check and the decrement are one
      // statement, so two concurrent scans cannot both pass the check and
      // drive the quantity negative.
      const db = await this.conn()
      const res = await db.run(
        'UPDATE inventory_batches SET currentQuantity = currentQuantity - ? WHERE id = ? AND currentQuantity >= ?',
        [quantity, batchId, quantity] as never[]
      )

      const changes = res.changes?.changes ?? 0
      if (changes === 0) {
        const rows = await this.query<InventoryBatch>(
          'SELECT id, currentQuantity FROM inventory_batches WHERE id = ?',
          [batchId]
        )
        if (rows.length === 0) return err('Batch not found', 'NOT_FOUND')
        return err(
          `Only ${rows[0].currentQuantity} unit(s) remain in this batch.`,
          'INSUFFICIENT_STOCK'
        )
      }

      await this.run(
        `INSERT INTO usage_logs (id, userId, userName, inventoryBatchId, quantityUsed, date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newId(), null, null, batchId, quantity, new Date().toISOString()]
      )
      await this.persist()

      const updated = await this.query<InventoryBatch>(
        `SELECT id, gtin, batchNumber, expirationDate, addedDate,
                initialQuantity, currentQuantity, producer, notes
         FROM inventory_batches WHERE id = ?`,
        [batchId]
      )
      return ok(updated[0])
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Could not record usage')
    }
  }

  async deleteBatch(id: string): Promise<Result<void>> {
    try {
      await this.run('DELETE FROM inventory_batches WHERE id = ?', [id])
      await this.persist()
      return ok(undefined)
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Could not delete batch')
    }
  }

  async recentUsage(limit = 50): Promise<Result<UsageLogEntry[]>> {
    try {
      const rows = await this.query<UsageLogEntry>(
        `SELECT id, userId, userName, inventoryBatchId, quantityUsed, date
         FROM usage_logs ORDER BY date DESC LIMIT ?`,
        [limit]
      )
      return ok(rows)
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Could not read usage log')
    }
  }

  async clearAllData(): Promise<Result<void>> {
    try {
      // Children first: usage logs reference batches, batches reference products.
      await this.run('DELETE FROM usage_logs')
      await this.run('DELETE FROM inventory_batches')
      await this.run('DELETE FROM products')
      await this.persist()
      return ok(undefined)
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Could not clear local data')
    }
  }
}
