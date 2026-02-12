# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** A conversational AI assistant with persistent, searchable memory -- so every session builds on everything that came before.
**Current focus:** Phase 2: Memory Pipeline

## Current Position

Phase: 2 of 3 (Memory Pipeline)
Plan: 2 of 3 in current phase
Status: Executing Phase 2
Last activity: 2026-02-12 -- Completed 02-02 (SQLite Storage and Hybrid Search)

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 7min
- Total execution time: 0.45 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2/2 | 19min | 10min |
| 02-memory-pipeline | 2/3 | 8min | 4min |

**Recent Trend:**
- Last 5 plans: 01-01 (7min), 01-02 (12min), 02-01 (3min), 02-02 (5min)
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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-12
Stopped at: Completed 02-02-PLAN.md
Resume file: None
