/**
 * Clears all memory data: SQLite tables, embeddings, and markdown files.
 *
 * Usage: npx tsx src/scripts/clear-memory.ts
 *
 * What gets cleared:
 * - memory_chunks table (content backing store)
 * - vec_memory_chunks virtual table (sqlite-vec embeddings)
 * - fts_memory_chunks virtual table (FTS5 keyword index)
 * - All markdown files in data/workspace/memory/
 */

import { rmSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { sqlite } from "../lib/db/index.js";

const MEMORY_DIR = resolve(process.env.MEMORY_DIR || "./data/workspace/memory");

function clearTables() {
  // Order matters: drop virtual tables first, then the backing table
  // FTS5 external content tables need special handling — just drop and recreate
  const tables = [
    { name: "vec_memory_chunks", drop: "DROP TABLE IF EXISTS vec_memory_chunks" },
    { name: "fts_memory_chunks", drop: "DROP TABLE IF EXISTS fts_memory_chunks" },
    { name: "memory_chunks", drop: "DELETE FROM memory_chunks" },
  ];

  for (const t of tables) {
    try {
      sqlite.exec(t.drop);
      console.error(`[clear] Cleared ${t.name}`);
    } catch (err) {
      console.error(`[clear] Skipped ${t.name} (does not exist or error): ${err}`);
    }
  }

  // Recreate the virtual tables so the schema stays intact
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_memory_chunks USING vec0(
      chunk_id INTEGER PRIMARY KEY,
      embedding float[768]
    );
  `);
  console.error("[clear] Recreated vec_memory_chunks");

  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_memory_chunks USING fts5(
      content,
      heading,
      file_path,
      content='memory_chunks',
      content_rowid='id'
    );
  `);
  console.error("[clear] Recreated fts_memory_chunks");

  // Reset autoincrement counter
  try {
    sqlite.exec("DELETE FROM sqlite_sequence WHERE name = 'memory_chunks'");
  } catch {
    // sqlite_sequence may not exist if autoincrement was never used
  }
}

function clearMarkdownFiles() {
  if (!existsSync(MEMORY_DIR)) {
    console.error(`[clear] Memory directory does not exist: ${MEMORY_DIR}`);
    return 0;
  }

  let count = 0;

  function walkAndRemove(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkAndRemove(fullPath);
        // Remove empty subdirectories
        try {
          rmSync(fullPath, { recursive: true });
          console.error(`[clear] Removed directory: ${fullPath}`);
        } catch {
          // non-empty or other error, skip
        }
      } else if (entry.name.endsWith(".md")) {
        rmSync(fullPath);
        count++;
        console.error(`[clear] Removed ${fullPath}`);
      }
    }
  }

  walkAndRemove(MEMORY_DIR);
  return count;
}

function main() {
  console.error("[clear] Clearing all memory data...\n");

  console.error("--- SQLite tables ---");
  clearTables();

  console.error("\n--- Markdown files ---");
  const fileCount = clearMarkdownFiles();

  console.error(`\n[clear] Done. Removed ${fileCount} markdown file(s) and cleared all memory tables.`);
}

main();
