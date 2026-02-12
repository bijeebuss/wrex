---
phase: 02-memory-pipeline
plan: 02
subsystem: memory
tags: [sqlite-vec, fts5, hybrid-search, rrf, vec0, indexer, vector-search, keyword-search]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: SQLite database with sqlite-vec extension loaded, better-sqlite3 connection
  - phase: 02-memory-pipeline plan 01
    provides: Chunk/EmbeddedChunk types, chunkMarkdown(), embed() singleton service
provides:
  - memory_chunks Drizzle table definition and raw SQL backing table
  - vec_memory_chunks vec0 virtual table for 768-dim vector similarity search
  - fts_memory_chunks FTS5 external content table for keyword search
  - indexFile() pipeline orchestrating chunk -> embed -> atomic store across 3 tables
  - removeFileIndex() and reindexFile() for full file re-indexing
  - vectorSearch() sqlite-vec KNN with search_query embedding
  - keywordSearch() FTS5 BM25 ranking with graceful error handling
  - hybridSearch() combining both via Reciprocal Rank Fusion (k=60)
  - SearchResult interface with source attribution
affects: [02-memory-pipeline plan 03, 03-chat-experience]

# Tech tracking
tech-stack:
  added: []
  patterns: [sqlite-vec vec0 KNN MATCH with Buffer wrapping, FTS5 external content table with explicit sync, Reciprocal Rank Fusion (k=60) for rank-based hybrid scoring, CAST(? AS INTEGER) workaround for vec0 primary key binding]

key-files:
  created:
    - src/lib/memory/indexer.ts
    - src/lib/memory/search.ts
  modified:
    - src/lib/db/schema.ts

key-decisions:
  - "CAST(? AS INTEGER) workaround for sqlite-vec vec0 primary key binding in better-sqlite3"
  - "Buffer.from(Float32Array) instead of raw ArrayBuffer for better-sqlite3 vec0 inserts"
  - "Application-level FTS5 sync (explicit INSERT in transaction) instead of triggers to avoid known better-sqlite3 edge cases"
  - "Expanded result sets (limit*2) for each sub-search before RRF fusion for better coverage"

patterns-established:
  - "Vec0 insert pattern: CAST(? AS INTEGER) for chunk_id, Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength) for embedding"
  - "FTS5 external content delete: INSERT INTO fts_table(fts_table, rowid, ...) SELECT 'delete', id, ... FROM content_table"
  - "Hybrid search pattern: run vector + keyword independently, merge via RRF with source attribution"
  - "Lazy prepared statement initialization: create on first use after ensureTables()"

# Metrics
duration: 5min
completed: 2026-02-12
---

# Phase 2 Plan 2: SQLite Storage and Hybrid Search Summary

**SQLite vec0/FTS5 storage with transactional indexing pipeline and hybrid search combining vector KNN and BM25 keyword ranking via Reciprocal Rank Fusion**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-12T20:12:57Z
- **Completed:** 2026-02-12T20:18:48Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Three-table storage architecture: memory_chunks (content), vec_memory_chunks (768-dim vectors), fts_memory_chunks (FTS5 keyword index)
- Transactional indexing pipeline that atomically inserts into all three tables per file
- Hybrid search combining sqlite-vec KNN distance with FTS5 BM25 ranking via RRF (k=60) with source attribution
- Full remove/re-index lifecycle for updating memory files

## Task Commits

Each task was committed atomically:

1. **Task 1: Create memory storage tables and indexer pipeline** - `b6fdaff` (feat)
2. **Task 2: Implement hybrid search with vector, FTS5, and RRF** - `211f098` (feat)

## Files Created/Modified
- `src/lib/db/schema.ts` - Added memoryChunks Drizzle table definition
- `src/lib/memory/indexer.ts` - ensureTables(), indexFile(), removeFileIndex(), reindexFile() orchestrating chunk -> embed -> store pipeline
- `src/lib/memory/search.ts` - vectorSearch(), keywordSearch(), hybridSearch() with SearchResult interface and RRF fusion

## Decisions Made
- Used CAST(? AS INTEGER) workaround for sqlite-vec vec0 primary key binding -- better-sqlite3 parameter binding doesn't preserve integer type affinity for vec0 virtual tables
- Used Buffer.from(Float32Array) instead of raw ArrayBuffer for vector insertion -- better-sqlite3 only accepts Buffer, not ArrayBuffer
- Application-level FTS5 sync (explicit INSERT in same transaction) instead of database triggers, avoiding known better-sqlite3 trigger edge cases with FTS5
- Fetch expanded result sets (limit*2) from each sub-search before RRF fusion to ensure good coverage across both methods

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] sqlite-vec vec0 primary key integer type affinity**
- **Found during:** Task 1 (indexFile implementation)
- **Issue:** sqlite-vec vec0 virtual table rejects bound parameters for INTEGER PRIMARY KEY -- "Only integers are allowed for primary key values" error even when passing JavaScript number
- **Fix:** Changed INSERT statement to use `CAST(? AS INTEGER)` for chunk_id parameter
- **Files modified:** src/lib/memory/indexer.ts
- **Verification:** indexFile('./memory/MEMORY.md') successfully inserts 4 chunks
- **Committed in:** b6fdaff (Task 1 commit)

**2. [Rule 1 - Bug] better-sqlite3 rejects ArrayBuffer for vec0 embedding**
- **Found during:** Task 1 (indexFile implementation)
- **Issue:** `new Float32Array(embedding).buffer` returns ArrayBuffer but better-sqlite3 can only bind Buffer instances
- **Fix:** Changed to `Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)` to create proper Node.js Buffer wrapping the Float32Array
- **Files modified:** src/lib/memory/indexer.ts
- **Verification:** Vector insertion succeeds and vec_memory_chunks contains correct row count
- **Committed in:** b6fdaff (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct sqlite-vec/better-sqlite3 interop. No scope creep.

## Issues Encountered
- sqlite-vec alpha (v0.1.7-alpha.2) has parameter binding quirks with better-sqlite3 that require explicit CAST for integer primary keys and Buffer wrapping for float vectors. These are documented in sqlite-vec GitHub issues but not well-documented in the sqlite-vec JS guide.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- indexer and search modules are ready for 02-03 (MCP server tools)
- indexFile() and reindexFile() can be called from MCP memory_write tool handler
- hybridSearch() can be called from MCP memory_search tool handler
- vectorSearch() and keywordSearch() available for direct use if needed

## Self-Check: PASSED

All 2 created files verified on disk. 1 modified file verified. Both commit hashes (b6fdaff, 211f098) verified in git log.

---
*Phase: 02-memory-pipeline*
*Completed: 2026-02-12*
