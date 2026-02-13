import { readFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { sqlite } from "../db/index";
import { chunkMarkdown } from "./chunker";
import { embed } from "./embedder";

/**
 * Memory indexer: orchestrates chunk -> embed -> store pipeline.
 *
 * Stores chunks in three tables atomically:
 * - memory_chunks: content backing table (authoritative row store)
 * - vec_memory_chunks: sqlite-vec virtual table for vector similarity search
 * - fts_memory_chunks: FTS5 virtual table for keyword search
 *
 * IMPORTANT: No console.log -- module used by MCP server (stdout = JSON-RPC).
 */

type Stmt = Database.Statement;

let tablesReady = false;

/**
 * Ensure all required database tables exist.
 * Called once on first use. Safe to call multiple times.
 */
export function ensureTables(): void {
  if (tablesReady) return;

  // Content backing table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS memory_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      heading TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      embedding_hash TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_file ON memory_chunks(file_path);
  `);

  // sqlite-vec virtual table for vector similarity search
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_memory_chunks USING vec0(
      chunk_id INTEGER PRIMARY KEY,
      embedding float[768]
    );
  `);

  // FTS5 virtual table for keyword search (external content backed by memory_chunks)
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_memory_chunks USING fts5(
      content,
      heading,
      file_path,
      content='memory_chunks',
      content_rowid='id'
    );
  `);

  tablesReady = true;
  console.error("[indexer] Tables ensured: memory_chunks, vec_memory_chunks, fts_memory_chunks");
}

// Prepared statements (lazily created after ensureTables)
let _stmts: {
  insertChunk: Stmt;
  insertVec: Stmt;
  insertFts: Stmt;
  selectChunksByFile: Stmt;
  deleteVec: Stmt;
  deleteFts: Stmt;
  deleteChunks: Stmt;
} | null = null;

function getStatements() {
  if (!_stmts) {
    _stmts = {
      insertChunk: sqlite.prepare(`
        INSERT INTO memory_chunks (file_path, heading, content, start_line, end_line, embedding_hash)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      insertVec: sqlite.prepare(`
        INSERT INTO vec_memory_chunks (chunk_id, embedding)
        VALUES (CAST(? AS INTEGER), ?)
      `),
      insertFts: sqlite.prepare(`
        INSERT INTO fts_memory_chunks (rowid, content, heading, file_path)
        VALUES (?, ?, ?, ?)
      `),
      selectChunksByFile: sqlite.prepare(`
        SELECT id FROM memory_chunks WHERE file_path = ?
      `),
      deleteVec: sqlite.prepare(`
        DELETE FROM vec_memory_chunks WHERE chunk_id = ?
      `),
      deleteFts: sqlite.prepare(`
        INSERT INTO fts_memory_chunks(fts_memory_chunks, rowid, content, heading, file_path)
        SELECT 'delete', id, content, heading, file_path FROM memory_chunks WHERE file_path = ?
      `),
      deleteChunks: sqlite.prepare(`
        DELETE FROM memory_chunks WHERE file_path = ?
      `),
    };
  }

  return _stmts;
}

/**
 * Index a markdown file: read -> chunk -> embed -> store in all three tables.
 *
 * @param filePath - Path to the markdown file on disk
 * @returns Number of chunks indexed
 */
export async function indexFile(filePath: string): Promise<number> {
  ensureTables();
  filePath = path.resolve(filePath);

  const content = readFileSync(filePath, "utf-8");
  const chunks = chunkMarkdown(content, filePath);

  if (chunks.length === 0) {
    console.error(`[indexer] No chunks produced for ${filePath}`);
    return 0;
  }

  // Embed all chunks sequentially (node-llama-cpp context handles one at a time)
  const embeddings: number[][] = [];
  for (const chunk of chunks) {
    const vec = await embed(chunk.content, "search_document");
    embeddings.push(vec);
  }

  // Store all chunks in a single transaction across all three tables
  const stmts = getStatements();
  const insertAll = sqlite.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      // Insert into memory_chunks and get back the rowid
      const result = stmts.insertChunk.run(
        chunk.filePath,
        chunk.heading,
        chunk.content,
        chunk.startLine,
        chunk.endLine,
        null, // embedding_hash -- not used yet
      );
      const rowId = Number(result.lastInsertRowid);

      // Insert embedding into vec_memory_chunks
      // sqlite-vec expects a Buffer wrapping a Float32Array (not an ArrayBuffer)
      const f32 = new Float32Array(embedding);
      const vecBuffer = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
      stmts.insertVec.run(rowId, vecBuffer);

      // Insert into fts_memory_chunks
      stmts.insertFts.run(rowId, chunk.content, chunk.heading, chunk.filePath);
    }
  });

  insertAll();

  console.error(`[indexer] Indexed ${chunks.length} chunks from ${filePath}`);
  return chunks.length;
}

/**
 * Remove all indexed data for a file from all three tables.
 *
 * @param filePath - Path to the file to remove
 */
export function removeFileIndex(filePath: string): void {
  ensureTables();
  filePath = path.resolve(filePath);

  const stmts = getStatements();

  const removeAll = sqlite.transaction(() => {
    // Get all chunk IDs for this file
    const rows = stmts.selectChunksByFile.all(filePath) as { id: number }[];

    // Delete from vec_memory_chunks for each chunk
    for (const row of rows) {
      stmts.deleteVec.run(row.id);
    }

    // Delete from FTS5 (special delete command for external content tables)
    stmts.deleteFts.run(filePath);

    // Delete from memory_chunks
    stmts.deleteChunks.run(filePath);
  });

  removeAll();

  console.error(`[indexer] Removed index for ${filePath}`);
}

/**
 * Re-index a file: remove old data, then re-index from scratch.
 * This is the recommended strategy for small markdown memory files.
 *
 * @param filePath - Path to the file to re-index
 * @returns Number of chunks indexed
 */
export async function reindexFile(filePath: string): Promise<number> {
  removeFileIndex(filePath);
  return indexFile(filePath);
}
