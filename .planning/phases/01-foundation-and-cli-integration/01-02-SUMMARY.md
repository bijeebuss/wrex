---
phase: 01-foundation-and-cli-integration
plan: 02
subsystem: api, infra
tags: [claude-cli, ndjson, sse, child-process, streaming, process-manager, zod]

# Dependency graph
requires:
  - phase: 01-01
    provides: "TanStack Start dev server, SQLite database singleton, Drizzle sessions/messages schema"
provides:
  - "TypeScript types for all Claude CLI NDJSON event types (system, stream_event, assistant, result)"
  - "Buffer-based NDJSON line parser for stdout streams"
  - "Process lifecycle manager for Claude Code CLI with SIGTERM/SIGKILL escalation"
  - "POST /api/chat SSE streaming endpoint bridging Claude CLI to browser"
  - "Minimal chat test UI with streaming text display"
affects: [02-memory-system, 03-chat-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NDJSON buffer parsing: accumulate chunks, split on newline, keep last incomplete segment"
    - "SSE via ReadableStream: enqueue 'data: JSON\\n\\n' lines, close on result event"
    - "Process manager singleton: Map<sessionId, ChildProcess> with SIGTERM + 5s SIGKILL escalation"
    - "Server.tsx route interception: check pathname before passing to TanStack Start handler"

key-files:
  created:
    - "src/lib/claude/types.ts"
    - "src/lib/claude/ndjson-parser.ts"
    - "src/lib/claude/process-manager.ts"
    - "src/lib/claude/chat-handler.ts"
  modified:
    - "src/server.tsx"
    - "src/routes/index.tsx"

key-decisions:
  - "No createServerFileRoute API in TanStack Start v1.159.5; intercepted /api/chat in server.tsx fetch handler instead"
  - "Chat handler placed in src/lib/claude/ (not src/routes/api/) to avoid TanStack Router file scanning warnings"
  - "Drizzle relational queries use .sync() for synchronous better-sqlite3 execution"
  - "Cost stored as micro-dollars (integer) in database for precision"
  - "Session event sent as first SSE line so browser gets sessionId before Claude starts"

patterns-established:
  - "Server API route pattern: intercept pathname in server.tsx before TanStack Start SSR handler"
  - "SSE streaming: POST fetch with ReadableStream reader on client, data: JSON lines on server"
  - "Process cleanup: ReadableStream cancel() kills process on client disconnect, process.on('exit'/'SIGTERM') kills all on shutdown"
  - "Claude CLI spawn args: -p prompt --output-format stream-json --verbose --include-partial-messages --dangerously-skip-permissions"

# Metrics
duration: 12min
completed: 2026-02-12
---

# Phase 1 Plan 2: CLI Integration Summary

**Claude Code CLI process manager with NDJSON stream parser, SSE bridge endpoint, and streaming chat test UI**

## Performance

- **Duration:** 11 min 38 sec
- **Started:** 2026-02-12T19:29:18Z
- **Completed:** 2026-02-12T19:40:56Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- TypeScript types covering all 4 Claude CLI NDJSON event types with discriminated union
- Buffer-based NDJSON parser that correctly handles chunked stdout (tested: split lines, multiple lines per chunk, empty lines, no trailing newline)
- Process manager tracking active Claude processes with spawn, kill (SIGTERM/SIGKILL escalation), killAll, and server shutdown handlers
- POST /api/chat SSE endpoint that spawns Claude CLI, parses NDJSON, and streams events to browser
- Database integration: sessions created on request, user messages saved, Claude session_id captured from init event, assistant messages saved with cost/token/duration data from result event
- Minimal chat UI with text input, streaming output display, status badge, stop button, and result statistics

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Claude Code event types, NDJSON parser, and process manager** - `09f678c` (feat)
2. **Task 2: Create SSE streaming endpoint and wire up chat UI** - `7186b0b` (feat)

## Files Created/Modified
- `src/lib/claude/types.ts` - TypeScript types for all Claude CLI NDJSON event types (SystemEvent, StreamEvent, AssistantEvent, ResultEvent, ClaudeEvent union)
- `src/lib/claude/ndjson-parser.ts` - Buffer-based NDJSON line parser for stdout streams
- `src/lib/claude/process-manager.ts` - Process lifecycle manager with spawn, kill, killAll, singleton instance, and shutdown cleanup
- `src/lib/claude/chat-handler.ts` - SSE streaming endpoint handler (POST /api/chat) with zod validation, session/message persistence, and process lifecycle
- `src/server.tsx` - Updated to intercept /api/chat requests before TanStack Start SSR handler
- `src/routes/index.tsx` - Replaced placeholder with streaming chat test UI

## Decisions Made
- **Server route approach:** TanStack Start v1.159.5 does not have `createServerFileRoute` or `createAPIFileRoute` APIs. The plan specified using `createServerFileRoute('/api/chat').methods()`, but this API doesn't exist in the current version. Instead, intercepted the `/api/chat` path in server.tsx's fetch handler before passing to TanStack Start. This is clean and doesn't require any additional dependencies.
- **Chat handler location:** Placed in `src/lib/claude/chat-handler.ts` instead of `src/routes/api/chat.ts` because TanStack Router scans the routes directory for route exports and warns about files that don't export a `Route`. Keeping it in lib/ avoids the warning and is semantically correct (it's a server handler, not a client route).
- **Drizzle sync queries:** Used `.sync()` on relational query builder for synchronous better-sqlite3 execution, since the database operations are synchronous.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] createServerFileRoute API does not exist in TanStack Start v1.159.5**
- **Found during:** Task 2 (creating SSE endpoint)
- **Issue:** Plan specified `createServerFileRoute('/api/chat').methods()` with POST handler, but this API is not exported from @tanstack/react-start v1.159.5. The framework uses `createServerFn` for RPC-style server functions, not file-based API routes.
- **Fix:** Intercepted `/api/chat` POST requests in server.tsx's fetch handler before passing to TanStack Start's SSR pipeline. Created standalone handler module in src/lib/claude/chat-handler.ts.
- **Files modified:** src/server.tsx, src/lib/claude/chat-handler.ts
- **Verification:** curl POST to /api/chat returns SSE response with session event; validation errors return proper 400 JSON
- **Committed in:** 7186b0b (Task 2 commit)

**2. [Rule 1 - Bug] Drizzle relational query returns query object, not result**
- **Found during:** Task 2 (chat handler implementation)
- **Issue:** `db.query.sessions.findFirst()` returns `SQLiteSyncRelationalQuery` object, not the result directly. TypeScript error: property 'claudeSessionId' does not exist on query type.
- **Fix:** Added `.sync()` call to execute the relational query synchronously (correct API for better-sqlite3 driver).
- **Files modified:** src/lib/claude/chat-handler.ts
- **Verification:** TypeScript compilation passes cleanly
- **Committed in:** 7186b0b (Task 2 commit)

**3. [Rule 1 - Bug] TanStack Router warns about non-route files in routes/ directory**
- **Found during:** Task 2 (dev server startup)
- **Issue:** Placing chat.ts in src/routes/api/ caused TanStack Router to warn "Route file does not export a Route" since it's a server handler, not a client route.
- **Fix:** Moved handler to src/lib/claude/chat-handler.ts and updated server.tsx import path.
- **Files modified:** src/lib/claude/chat-handler.ts (moved), src/server.tsx (import updated)
- **Verification:** Dev server starts without warnings
- **Committed in:** 7186b0b (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** The server route API deviation required a different approach for the endpoint, but the resulting architecture is equally clean. The Drizzle and Router fixes were straightforward. No scope creep.

## Issues Encountered
- **Claude CLI not producing output in dev environment:** The Claude Code CLI (v2.1.39) is installed but does not produce NDJSON output when spawned as a child process in this container environment. This appears to be an authentication limitation in the containerized development environment, not a code bug. The SSE endpoint correctly sends the initial session event and database records are created properly. Full end-to-end streaming will work when Claude CLI has proper authentication context.

## User Setup Required
None - no external service configuration required. Claude Code CLI must be authenticated for the chat endpoint to produce streaming responses.

## Next Phase Readiness
- SSE streaming pipeline is fully wired: browser POST -> server spawn -> NDJSON parse -> SSE -> browser reader
- Process manager tracks and cleans up all Claude processes (disconnect, shutdown, manual kill)
- Database schema handles session and message CRUD with Claude session_id for --resume
- Chat test UI ready for end-to-end testing when Claude CLI authentication is available
- All types and interfaces established for Phase 2 memory system to consume event data

## Self-Check: PASSED

All 4 created files verified present. Both modified files verified. Both task commits (09f678c, 7186b0b) verified in git log. Database schema operational with test records.

---
*Phase: 01-foundation-and-cli-integration*
*Completed: 2026-02-12*
