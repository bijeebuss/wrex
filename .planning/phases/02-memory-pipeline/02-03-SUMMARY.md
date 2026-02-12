---
phase: 02-memory-pipeline
plan: 03
subsystem: memory
tags: [mcp, stdio, json-rpc, claude-code, memory-search, memory-get, memory-write]

# Dependency graph
requires:
  - phase: 02-memory-pipeline plan 01
    provides: embed() singleton service, chunkMarkdown() for re-indexing
  - phase: 02-memory-pipeline plan 02
    provides: hybridSearch(), reindexFile(), ensureTables() for storage and search
provides:
  - MCP server entry point with stdio transport for Claude Code integration
  - memory_search tool exposing hybrid vector+keyword search
  - memory_get tool for reading memory files with path traversal protection
  - memory_write tool for persisting and re-indexing memory content
  - .mcp.json configuration for Claude Code MCP discovery
  - memory:index bootstrap script for bulk indexing
affects: [03-chat-experience]

# Tech tracking
tech-stack:
  added: []
  patterns: [MCP stdio server with McpServer + StdioServerTransport, stderr-only logging in MCP server, path traversal prevention via resolve + startsWith check]

key-files:
  created:
    - src/mcp-server.ts
    - src/scripts/index-memory.ts
    - .mcp.json
  modified:
    - package.json

key-decisions:
  - "Dedicated script file (src/scripts/index-memory.ts) instead of tsx -e inline to avoid CJS top-level-await limitation"
  - "stderr-only logging throughout MCP server and all imported memory modules to preserve stdio JSON-RPC transport"

patterns-established:
  - "MCP tool pattern: return {content: [{type: 'text', text}]} with isError: true for error cases"
  - "Path traversal protection: resolve(join(MEMORY_DIR, path)) then startsWith(MEMORY_DIR) check"
  - "Graceful shutdown: SIGINT/SIGTERM -> disposeEmbedder() -> server.close() -> process.exit(0)"

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 2 Plan 3: MCP Server Summary

**MCP stdio server exposing memory_search, memory_get, and memory_write tools for Claude Code integration with full pipeline from write to immediate searchability**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T20:21:08Z
- **Completed:** 2026-02-12T20:25:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- MCP server with three tools registered and accessible over stdio JSON-RPC transport
- memory_search formats hybrid search results with headings, file paths, line ranges, scores, and content previews
- memory_get reads memory files with line range extraction and path traversal prevention
- memory_write persists content (append/overwrite) and triggers immediate re-indexing
- .mcp.json configures Claude Code to discover wrex-memory server automatically
- Full pipeline verified end-to-end: index MEMORY.md -> 4 chunks -> hybrid search returns ranked results

## Task Commits

Each task was committed atomically:

1. **Task 1: Create MCP server with memory_search, memory_get, memory_write tools** - `a908038` (feat)
2. **Task 2: Configure MCP for Claude Code and add convenience scripts** - `1572295` (feat)

## Files Created/Modified
- `src/mcp-server.ts` - Standalone MCP server entry point with three memory tools over stdio
- `src/scripts/index-memory.ts` - Bootstrap script to index all markdown files in memory/ directory
- `.mcp.json` - Claude Code MCP server discovery configuration
- `package.json` - Added mcp:dev and memory:index scripts

## Decisions Made
- Used dedicated script file (src/scripts/index-memory.ts) instead of tsx -e inline command because node-llama-cpp uses top-level await in its config.js, which tsx's CJS transform mode does not support. File-based execution correctly uses ESM via the project's "type": "module" in package.json.
- All logging uses console.error exclusively to preserve the stdio JSON-RPC transport -- any console.log would corrupt the MCP protocol.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Changed memory:index from tsx -e inline to dedicated script file**
- **Found during:** Task 2 (memory:index script verification)
- **Issue:** `tsx -e` evaluates code as CJS, which fails with node-llama-cpp's top-level await in config.js: "Top-level await is currently not supported with the cjs output format"
- **Fix:** Created `src/scripts/index-memory.ts` as a proper ESM file and pointed the npm script at it
- **Files modified:** package.json, src/scripts/index-memory.ts (new)
- **Verification:** `npm run memory:index` successfully indexes 4 chunks from memory/MEMORY.md
- **Committed in:** 1572295 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary workaround for tsx CJS limitation with node-llama-cpp. Same functionality, cleaner implementation. No scope creep.

## Issues Encountered
- node-llama-cpp has no prebuilt binary for linux arm64; it falls back to building from source. The build succeeds in this environment (cmake was downloaded by xpack during a previous run), but produces tokenizer warnings. The model works correctly despite the warnings.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Complete memory pipeline is operational: write -> chunk -> embed -> store -> hybrid search -> MCP tools
- Claude Code can discover and use the three memory tools via .mcp.json
- Phase 2 (Memory Pipeline) is fully complete; ready for Phase 3 (Chat Experience)
- The memory_search, memory_get, and memory_write tools provide the foundation for persistent conversational memory

## Self-Check: PASSED

All 3 created files verified on disk. 1 modified file verified. Both commit hashes (a908038, 1572295) verified in git log.

---
*Phase: 02-memory-pipeline*
*Completed: 2026-02-12*
