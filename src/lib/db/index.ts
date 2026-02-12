import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import * as schema from './schema'

const DB_PATH = process.env.DB_PATH || './data/wrex.db'

// Ensure the database directory exists
mkdirSync(dirname(DB_PATH), { recursive: true })

// Create the raw better-sqlite3 connection
const sqlite = new Database(DB_PATH)

// Set pragmas for performance and correctness
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// Load sqlite-vec extension BEFORE wrapping with Drizzle
sqliteVec.load(sqlite)

// Validate sqlite-vec loaded successfully
const vecVersion = sqlite.prepare('SELECT vec_version() as version').get() as {
  version: string
}
console.log(`[db] sqlite-vec loaded: v${vecVersion.version}`)
console.log(`[db] database path: ${DB_PATH}`)

// Create Drizzle ORM instance wrapping the same connection
export const db = drizzle(sqlite, { schema })

// Export raw connection for direct extension queries (sqlite-vec virtual tables)
export { sqlite }
