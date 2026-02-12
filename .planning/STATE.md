# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** A conversational AI assistant with persistent, searchable memory -- so every session builds on everything that came before.
**Current focus:** Phase 3: Chat Experience (Plan 02 complete, 1 remaining)

## Current Position

Phase: 3 of 3 (Chat Experience)
Plan: 2 of 3 in current phase -- COMPLETE
Status: Executing Phase 3
Last activity: 2026-02-12 -- Completed 03-02 (Session Management & Sidebar)

Progress: [█████████░] 88%

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 6min
- Total execution time: 0.65 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2/2 | 19min | 10min |
| 02-memory-pipeline | 3/3 | 12min | 4min |
| 03-chat-experience | 2/3 | 8min | 4min |

**Recent Trend:**
- Last 5 plans: 02-01 (3min), 02-02 (5min), 02-03 (4min), 03-01 (4min), 03-02 (4min)
- Trend: Accelerating

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Vite 7 required by @tanstack/react-start@1.159.5 (plan specified Vite 6)
- TanStack Start v1.159.5 uses new entry API: server.tsx exports {fetch}, router.tsx exports getRouter(), StartClient takes no props
- ScrollRestoration component deprecated; use createRouter option instead
- No createServerFileRoute API in TanStack Start v1.159.5; intercepted /api/chat in server.tsx fetch handler instead
- Chat handler in src/lib/claude/ (not routes/api/) to avoid TanStack Router file scanning warnings
- Drizzle relational queries use .sync() for synchronous better-sqlite3 execution
- Sequential embedding in embedBatch (node-llama-cpp context handles one request at a time)
- Concurrent-safe singleton init for embedder using shared promise to prevent duplicate model loading
- stderr-only logging in embedder module to preserve MCP stdio transport
- CAST(? AS INTEGER) workaround for sqlite-vec vec0 primary key binding in better-sqlite3
- Buffer.from(Float32Array) instead of raw ArrayBuffer for better-sqlite3 vec0 inserts
- Application-level FTS5 sync (explicit INSERT in transaction) instead of triggers
- Expanded result sets (limit*2) for each sub-search before RRF fusion
- Dedicated script file (src/scripts/index-memory.ts) instead of tsx -e inline to avoid CJS top-level-await limitation
- stderr-only logging throughout MCP server and all imported memory modules to preserve stdio JSON-RPC transport
- requestAnimationFrame batching for text delta updates to prevent render thrashing during fast token streaming
- Replaced findLastIndex with manual loop for ES2022 target compatibility (tsconfig targets ES2022)
- Tailwind v4 CSS variable theming with bg-(--color-name) syntax for chat bubble colors
- React.memo with custom comparator on ChatMessage to prevent re-renders of non-streaming messages
- TanStack Start createServerFn for session CRUD (RPC-style, no manual API routes needed)
- Raw SQL with ROW_NUMBER() window function for efficient last-message-per-session query instead of Drizzle relations
- Fixed-position sidebar with margin-based content offset for smooth open/close transitions
- Pathless layout (_chat prefix) wraps all routes without URL segment

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-12
Stopped at: Completed 03-02-PLAN.md
Resume file: None
