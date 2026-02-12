---
phase: 02-memory-pipeline
plan: 01
subsystem: memory
tags: [node-llama-cpp, nomic-embed-text, embeddings, markdown, chunker, gguf]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: SQLite database with sqlite-vec extension, TypeScript project structure
provides:
  - Chunk and EmbeddedChunk type definitions
  - Heading-aware markdown chunker (chunkMarkdown)
  - Singleton embedding service with task prefix enforcement (embed, embedBatch, getEmbedder, disposeEmbedder)
  - Seed memory file (memory/MEMORY.md)
  - Downloaded nomic-embed-text-v1.5 Q8_0 GGUF model
affects: [02-memory-pipeline, 03-chat-experience]

# Tech tracking
tech-stack:
  added: [node-llama-cpp ^3.15.1, "@modelcontextprotocol/sdk ^1.26.0"]
  patterns: [singleton embedding context, heading-aware markdown chunking, task prefix enforcement for nomic-embed models]

key-files:
  created:
    - src/lib/memory/types.ts
    - src/lib/memory/chunker.ts
    - src/lib/memory/embedder.ts
    - memory/MEMORY.md
  modified:
    - package.json
    - package-lock.json
    - .gitignore

key-decisions:
  - "Sequential embedding in embedBatch (node-llama-cpp context handles one request at a time)"
  - "Concurrent-safe singleton init using shared promise to prevent duplicate model loading"
  - "stderr-only logging in embedder module to preserve MCP stdio transport"

patterns-established:
  - "Singleton pattern for expensive model loading: lazy init with cached promise"
  - "Task prefix enforcement: embed() requires search_document|search_query type parameter"
  - "Heading-aware chunking: split at #/##/### boundaries, overflow at paragraph boundaries with line overlap"

# Metrics
duration: 3min
completed: 2026-02-12
---

# Phase 2 Plan 1: Embedding Service and Markdown Chunker Summary

**Heading-aware markdown chunker and singleton nomic-embed-text-v1.5 embedding service producing 768-dim vectors with enforced task prefixes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-12T20:07:52Z
- **Completed:** 2026-02-12T20:10:44Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Heading-aware markdown chunker that splits at #/##/### boundaries with paragraph overflow splitting and line-level metadata tracking
- Singleton embedding service wrapping node-llama-cpp with lazy model loading and concurrent-safe initialization
- Task prefix enforcement (search_document/search_query) at the API level -- raw text can never be embedded directly
- nomic-embed-text-v1.5 Q8_0 model (146 MiB) downloaded and verified producing 768-dim vectors
- Shared Chunk/EmbeddedChunk types with EMBEDDING_DIM constant for downstream consumers

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps, download model, create types + chunker** - `c7895b5` (feat)
2. **Task 2: Singleton embedding service with prefix enforcement** - `12755f6` (feat)

## Files Created/Modified
- `src/lib/memory/types.ts` - Chunk, EmbeddedChunk interfaces and EMBEDDING_DIM constant (768)
- `src/lib/memory/chunker.ts` - chunkMarkdown() heading-aware splitter with paragraph overflow
- `src/lib/memory/embedder.ts` - embed(), embedBatch(), getEmbedder(), disposeEmbedder() singleton service
- `memory/MEMORY.md` - Seed memory file with 3 sections for testing
- `package.json` - Added node-llama-cpp, @modelcontextprotocol/sdk, models:pull script
- `.gitignore` - Added models/ directory

## Decisions Made
- Sequential embedding in embedBatch() since node-llama-cpp's embedding context handles one request at a time
- Concurrent-safe singleton initialization using a shared promise to prevent duplicate model loading from parallel callers
- stderr-only logging in embedder module (no console.log) to preserve MCP server stdio transport integrity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- tsx runner fails with node-llama-cpp due to top-level await in CJS transform mode; used `node --import tsx/esm` for smoke testing instead. This is a tsx limitation, not an issue for the actual application (which uses Vite/ESM).

## User Setup Required

None - no external service configuration required. Model downloads automatically via `npm run models:pull`.

## Next Phase Readiness
- Types, chunker, and embedder are ready for 02-02 (SQLite vector storage and hybrid search)
- chunkMarkdown() output feeds directly into embed() for indexing pipeline
- embedder's embed(text, 'search_query') is ready for search-time query embedding

## Self-Check: PASSED

All 4 created files verified on disk. Both commit hashes (c7895b5, 12755f6) verified in git log.

---
*Phase: 02-memory-pipeline*
*Completed: 2026-02-12*
