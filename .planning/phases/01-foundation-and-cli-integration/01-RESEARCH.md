# Phase 1: Foundation and CLI Integration - Research

**Researched:** 2026-02-12
**Domain:** TanStack Start, Claude Code CLI integration, SQLite/Drizzle ORM, SSE streaming
**Confidence:** HIGH

## Summary

Phase 1 establishes the server skeleton, database layer, and Claude Code CLI process manager. The three core technology domains are: (1) TanStack Start as the web framework with Vite, (2) SQLite via better-sqlite3 with Drizzle ORM for the session schema plus sqlite-vec/FTS5 extensions, and (3) spawning Claude Code CLI as a child process, parsing its NDJSON streaming output, and bridging events to the browser via SSE.

TanStack Start has recently migrated from Vinxi to Vite (v1.121.0+). The current approach uses `vite.config.ts` with the `@tanstack/react-start` plugin -- **not** the old `app.config.ts` pattern. Server routes use `createServerFileRoute()` with `.methods()` for HTTP handlers. Claude Code CLI (v2.1.39 confirmed on this machine) outputs NDJSON with `--output-format stream-json --verbose --include-partial-messages`, producing well-structured events with `type` discriminators (`system`, `stream_event`, `assistant`, `result`). The key challenge is reliable NDJSON parsing from a child process stdout (buffer chunking) and zombie process prevention.

**Primary recommendation:** Use better-sqlite3 (not node:sqlite) with Drizzle ORM for the database layer, `child_process.spawn` for Claude Code CLI with a robust NDJSON line parser, and TanStack Start server routes returning SSE `Response` objects for streaming to the browser.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-start | 1.159.5 | Full-stack React framework | Project requirement; provides SSR, server routes, server functions |
| @tanstack/react-router | latest | File-based routing | Required by TanStack Start; type-safe routing |
| drizzle-orm | 0.45.1 | SQL ORM with type-safe schema | Type-safe, zero-overhead SQLite support; migrations via drizzle-kit |
| better-sqlite3 | 12.6.2 | SQLite driver | Synchronous, fast, stable; sqlite-vec compatible; production-ready (node:sqlite still experimental) |
| sqlite-vec | 0.1.7-alpha.2 | Vector search SQLite extension | Required for Phase 2 memory; load extension in Phase 1 to validate setup |
| vite | 6.x | Build tool and dev server | Required by TanStack Start (post-Vinxi migration) |
| react | 19.x | UI framework | Required by TanStack Start |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-kit | latest | Schema migrations | Dev dependency for `drizzle-kit push` / `drizzle-kit generate` |
| vite-tsconfig-paths | latest | TypeScript path resolution in Vite | If using tsconfig path aliases like `@/` |
| zod | 4.x | Runtime validation | Validating API request bodies, Claude CLI event parsing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-sqlite3 | node:sqlite (built-in) | node:sqlite is experimental on Node 22, fewer features, no Drizzle adapter; openclaw uses it but they suppress warnings and wrap it |
| Drizzle ORM | raw SQL via better-sqlite3 | Drizzle gives type-safe schema, migrations, and query builder at near-zero overhead; worth the dependency |
| @tanstack/react-start | Express/Hono + Vite | TanStack Start is a project requirement; not negotiable |

**Installation:**
```bash
npm create @tanstack/start@latest
# Then add:
npm install drizzle-orm better-sqlite3 sqlite-vec zod
npm install -D drizzle-kit @types/better-sqlite3
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── routes/
│   ├── __root.tsx           # Root layout
│   ├── index.tsx            # Home page
│   └── api/
│       └── chat.stream.ts   # SSE streaming endpoint (server route)
├── lib/
│   ├── db/
│   │   ├── index.ts         # Database singleton (better-sqlite3 + Drizzle)
│   │   ├── schema.ts        # Drizzle schema definitions
│   │   └── migrate.ts       # Migration runner
│   └── claude/
│       ├── process-manager.ts   # Spawn, track, kill Claude processes
│       ├── ndjson-parser.ts     # NDJSON line parser (Transform stream)
│       └── types.ts             # TypeScript types for Claude CLI events
├── router.tsx               # TanStack Router setup
├── client.tsx               # Client entry point
└── server.tsx               # Server entry point (createStartHandler)
vite.config.ts               # Vite config with TanStack Start plugin
drizzle.config.ts            # Drizzle Kit config
```

### Pattern 1: TanStack Start Server Entry
**What:** The server entry point bootstraps TanStack Start with SSR streaming
**When to use:** Always -- this is the required server setup
**Example:**
```typescript
// src/server.tsx
// Source: TanStack Start docs - build from scratch guide
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { createRouter } from './router'

export default createStartHandler({
  createRouter,
})(defaultStreamHandler)
```

### Pattern 2: Server Route for SSE Streaming
**What:** A server route that spawns Claude Code CLI, parses NDJSON, and streams events as SSE
**When to use:** For the /api/chat.stream endpoint
**Example:**
```typescript
// src/routes/api/chat.stream.ts
// Source: TanStack Start server routes docs + verified Claude CLI output
import { createServerFileRoute } from '@tanstack/react-start/server'

export const ServerRoute = createServerFileRoute('/api/chat/stream')
  .methods({
    POST: async ({ request }) => {
      const body = await request.json()
      const { prompt, sessionId } = body

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          // Spawn claude process and pipe NDJSON events as SSE
          const send = (data: unknown) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            )
          }
          // ... spawn logic, NDJSON parsing, cleanup
        },
        cancel() {
          // Kill the claude process on client disconnect
        }
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    },
  })
```

### Pattern 3: Database Singleton with Extension Loading
**What:** A single database connection with sqlite-vec and FTS5 loaded at startup
**When to use:** All database access goes through this singleton
**Example:**
```typescript
// src/lib/db/index.ts
// Source: openclaw/src/memory/sqlite-vec.ts pattern + better-sqlite3 docs
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import * as schema from './schema'

const DB_PATH = process.env.DB_PATH || './data/wrex.db'

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// Load sqlite-vec extension
sqliteVec.load(sqlite)

export const db = drizzle(sqlite, { schema })
export { sqlite } // Expose raw connection for extension queries
```

### Pattern 4: Claude Code Process Manager
**What:** Manages spawning, tracking, and cleanup of Claude Code CLI processes
**When to use:** Every time a user sends a message
**Example:**
```typescript
// src/lib/claude/process-manager.ts
// Source: openclaw/src/process/child-process-bridge.ts + Node.js child_process docs
import { spawn, type ChildProcess } from 'node:child_process'

export class ClaudeProcessManager {
  private processes = new Map<string, ChildProcess>()

  spawn(sessionId: string, prompt: string, opts?: { resumeSessionId?: string }) {
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--dangerously-skip-permissions',
    ]
    if (opts?.resumeSessionId) {
      args.push('--resume', opts.resumeSessionId)
    }

    const child = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    this.processes.set(sessionId, child)

    child.once('exit', () => {
      this.processes.delete(sessionId)
    })

    return child
  }

  kill(sessionId: string) {
    const child = this.processes.get(sessionId)
    if (child && !child.killed) {
      child.kill('SIGTERM')
      // Force kill after timeout
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL')
      }, 5000)
    }
    this.processes.delete(sessionId)
  }

  killAll() {
    for (const [id] of this.processes) {
      this.kill(id)
    }
  }
}
```

### Pattern 5: NDJSON Line Parser
**What:** A Transform stream or manual buffer that correctly handles chunked NDJSON from stdout
**When to use:** Parsing Claude Code CLI stdout
**Example:**
```typescript
// src/lib/claude/ndjson-parser.ts
// Source: NDJSON spec + Node.js stream best practices

export function parseNDJSON(
  stdout: NodeJS.ReadableStream,
  onEvent: (event: ClaudeEvent) => void,
  onError: (error: Error) => void,
) {
  let buffer = ''

  stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf-8')
    const lines = buffer.split('\n')
    // Keep the last (possibly incomplete) line in the buffer
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const event = JSON.parse(trimmed)
        onEvent(event)
      } catch (err) {
        onError(new Error(`Failed to parse NDJSON line: ${trimmed}`))
      }
    }
  })

  stdout.on('end', () => {
    // Process any remaining data in buffer
    const trimmed = buffer.trim()
    if (trimmed) {
      try {
        onEvent(JSON.parse(trimmed))
      } catch (err) {
        onError(new Error(`Failed to parse final NDJSON line: ${trimmed}`))
      }
    }
  })
}
```

### Anti-Patterns to Avoid
- **Parsing stdout line-by-line without buffering:** Node.js `data` events deliver arbitrary chunks, not lines. A single JSON object may be split across multiple chunks. Always buffer and split on newline.
- **Not handling process cleanup on SSE disconnect:** If the client closes the EventSource connection, the ReadableStream's `cancel()` must kill the child process. Otherwise zombie claude processes accumulate.
- **Using node:sqlite in production:** It is still experimental on Node 22 and emits warnings. Use better-sqlite3 for stability.
- **Storing JSON events as strings in SQLite:** Use proper typed columns. Session messages can reference a JSON column via Drizzle's text mode, but keep structured data in typed columns where possible.
- **Creating a new database connection per request:** SQLite is single-writer. Use a singleton connection with WAL mode.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NDJSON stream parsing | Custom regex splitter | Buffer-based line parser (Pattern 5 above) | Chunked data from stdout splits JSON across boundaries; regex fails on partial data |
| SQLite migrations | Manual CREATE TABLE scripts | Drizzle Kit (`drizzle-kit push` or `drizzle-kit generate + migrate`) | Schema drift, missing migrations, manual tracking |
| SSR + routing | Custom Express + React renderer | TanStack Start (project requirement) | Handles SSR, hydration, code splitting, etc. |
| Vector similarity search | Custom cosine similarity SQL | sqlite-vec extension | Written in C, orders of magnitude faster |
| Process signal handling | Manual signal listeners | Structured ProcessManager class with timeout escalation | Edge cases around SIGTERM ignored, process groups, already-exited processes |

**Key insight:** The biggest complexity in this phase is the NDJSON parsing + process lifecycle management. Claude Code CLI sessions can run for minutes, use tools that emit their own events, and may be interrupted by client disconnects. Every edge case (partial JSON line, process crash, client abort, server restart) must be handled.

## Common Pitfalls

### Pitfall 1: NDJSON Buffer Splitting
**What goes wrong:** JSON events appear corrupted or missing because `stdout.on('data')` delivers partial lines
**Why it happens:** Node.js streams deliver data in arbitrary-sized chunks. A single JSON line can be split across 2+ chunks, or multiple lines can arrive in one chunk.
**How to avoid:** Always buffer incoming data, split on `\n`, and only parse complete lines. Keep the last incomplete segment in the buffer for the next chunk.
**Warning signs:** `JSON.parse` errors on seemingly valid data; events appear missing or duplicated.

### Pitfall 2: Zombie Claude Code Processes
**What goes wrong:** Claude Code processes keep running after the user disconnects or navigates away
**Why it happens:** SSE connections close silently. If the server route doesn't detect the disconnect and kill the child process, it runs forever.
**How to avoid:** Use ReadableStream's `cancel()` callback to kill the process. Also register cleanup on `process.on('exit')` and `process.on('SIGTERM')` for server shutdown. Implement a process registry that tracks all active processes. Use SIGTERM with a SIGKILL fallback after timeout.
**Warning signs:** `ps aux | grep claude` shows many processes; memory/CPU usage grows over time.

### Pitfall 3: TanStack Start Vinxi vs Vite Confusion
**What goes wrong:** Following outdated tutorials that use `app.config.ts`, `vinxi`, `createAPIFileRoute`, or old project structure
**Why it happens:** TanStack Start migrated from Vinxi to Vite in v1.121.0 (late 2025). Many tutorials and examples are outdated.
**How to avoid:** Use `vite.config.ts` with `@tanstack/react-start/plugin/vite`. Use `createServerFileRoute()` not `createAPIFileRoute()`. Default directory is `src/` not `app/`.
**Warning signs:** Errors about missing vinxi, app.config.ts not found, createAPIFileRoute not exported.

### Pitfall 4: SQLite Extension Loading Order
**What goes wrong:** sqlite-vec queries fail because the extension wasn't loaded before the first query
**Why it happens:** Extensions must be loaded before any queries that use their functions. If using Drizzle, ensure the raw better-sqlite3 instance loads extensions before wrapping with Drizzle.
**How to avoid:** Load extensions on the raw `Database` instance before passing to `drizzle()`. Verify with `SELECT vec_version()` immediately after load.
**Warning signs:** "no such function: vec_version" errors; sqlite-vec queries return errors.

### Pitfall 5: SSE Connection Limits
**What goes wrong:** Browser limits simultaneous SSE connections per domain (typically 6 for HTTP/1.1)
**Why it happens:** HTTP/1.1 has a per-domain connection limit. Each EventSource uses one connection.
**How to avoid:** For a single-user app this is less critical, but use HTTP/2 if possible (Vite dev server supports it). Don't open multiple SSE connections for the same session.
**Warning signs:** New SSE connections hang or fail to connect; browser dev tools show pending requests.

### Pitfall 6: Claude Code Session ID Extraction
**What goes wrong:** Cannot resume sessions because session_id was not captured from the initial response
**Why it happens:** The session_id appears in multiple event types. The first reliable place is the `system` init event or any `stream_event`.
**How to avoid:** Extract `session_id` from the very first NDJSON event (which is a `system` event with `subtype: "hook_started"` or `subtype: "init"`). Store it in the database immediately.
**Warning signs:** `--resume` fails; session continuity broken.

## Code Examples

Verified patterns from official sources and live testing:

### Claude Code CLI NDJSON Event Types (Verified)
```typescript
// Source: Live testing on this machine with Claude Code v2.1.39
// Command: claude -p "..." --output-format stream-json --verbose --include-partial-messages

// Event type discriminator is the top-level "type" field
type ClaudeEvent =
  | SystemEvent       // type: "system"
  | StreamEvent       // type: "stream_event"
  | AssistantEvent    // type: "assistant"
  | ResultEvent       // type: "result"

// System events (initialization, hooks)
interface SystemEvent {
  type: 'system'
  subtype: 'init' | 'hook_started' | 'hook_response'
  session_id: string
  uuid: string
  // init subtype includes: cwd, tools, mcp_servers, model, etc.
  // hook subtypes include: hook_id, hook_name, hook_event
}

// Stream events (token-by-token streaming from Claude API)
interface StreamEvent {
  type: 'stream_event'
  event: {
    type: 'message_start' | 'content_block_start' | 'content_block_delta'
         | 'content_block_stop' | 'message_delta' | 'message_stop'
    // For content_block_delta:
    index?: number
    delta?: {
      type: 'text_delta' | 'input_json_delta'
      text?: string        // for text_delta
      partial_json?: string // for input_json_delta (tool inputs)
    }
    // For content_block_start:
    content_block?: {
      type: 'text' | 'tool_use'
      name?: string  // tool name for tool_use
      id?: string    // tool use id
    }
  }
  session_id: string
  parent_tool_use_id: string | null
  uuid: string
}

// Assistant event (complete message after streaming finishes)
interface AssistantEvent {
  type: 'assistant'
  message: {
    model: string
    id: string
    role: 'assistant'
    content: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }>
    stop_reason: string | null
    usage: { input_tokens: number; output_tokens: number }
  }
  session_id: string
  parent_tool_use_id: string | null
  uuid: string
}

// Result event (final event when Claude finishes)
interface ResultEvent {
  type: 'result'
  subtype: 'success' | 'error'
  is_error: boolean
  duration_ms: number
  num_turns: number
  result: string
  session_id: string
  total_cost_usd: number
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  }
  uuid: string
}
```

### Claude Code CLI Spawn Command (Verified)
```bash
# Source: Verified on this machine - Claude Code v2.1.39

# New session:
claude -p "Your prompt here" \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --dangerously-skip-permissions

# Resume existing session:
claude -p "Follow-up prompt" \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --dangerously-skip-permissions \
  --resume "session-uuid-here"
```

### Drizzle Schema for Sessions (Phase 1)
```typescript
// src/lib/db/schema.ts
// Source: Drizzle ORM SQLite docs + project requirements
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),                    // UUID
  claudeSessionId: text('claude_session_id'),     // Claude Code's session ID for --resume
  title: text('title'),                           // Auto-generated or from first message
  status: text('status').notNull().default('active'), // active | completed | error
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),                    // UUID
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),                   // user | assistant | system
  content: text('content').notNull(),             // Message text content
  toolUse: text('tool_use'),                      // JSON string of tool use blocks (if any)
  claudeMessageId: text('claude_message_id'),     // Claude API message ID
  costUsd: integer('cost_usd'),                   // Cost in micro-dollars (integer for precision)
  durationMs: integer('duration_ms'),             // Response time
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})
```

### TanStack Start Vite Configuration (Verified)
```typescript
// vite.config.ts
// Source: TanStack Start migration guide (Vinxi -> Vite, v1.121.0+)
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tanstackStart(),
  ],
})
```

### TanStack Start Router Setup (Verified)
```typescript
// src/router.tsx
// Source: TanStack Start docs
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
```

### sqlite-vec Loading with better-sqlite3 (Verified)
```typescript
// Source: sqlite-vec npm docs + openclaw/src/memory/sqlite-vec.ts
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

const db = new Database('./data/wrex.db')
sqliteVec.load(db)

// Verify extension loaded
const version = db.prepare('SELECT vec_version() as version').get()
console.log('sqlite-vec version:', version)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TanStack Start with Vinxi + app.config.ts | TanStack Start with Vite + vite.config.ts | v1.121.0 (late 2025) | Must use vite.config.ts, @tanstack/react-start (not @tanstack/start) |
| createAPIFileRoute() | createServerFileRoute().methods() | v1.121.0+ | Different API for server routes |
| Default app/ directory | Default src/ directory | v1.121.0+ | Project structure change |
| Claude Code `--output-format json` | `--output-format stream-json --verbose --include-partial-messages` | Always available | stream-json gives real-time token streaming; json gives final result only |
| node:sqlite experimental | better-sqlite3 stable | Ongoing (node:sqlite still experimental in Node 22) | better-sqlite3 is the production choice; node:sqlite for zero-dep scenarios |

**Deprecated/outdated:**
- `@tanstack/start` package: replaced by `@tanstack/react-start`
- `vinxi` dependency: no longer needed; Vite handles everything
- `app.config.ts`: replaced by `vite.config.ts`
- `createAPIFileRoute()`: replaced by `createServerFileRoute().methods()`
- `ssr.tsx` / `client.tsx` entry files: replaced by `server.tsx` / `client.tsx` in new structure

## Open Questions

1. **TanStack Start server route file naming for SSE**
   - What we know: Server routes go in `src/routes/api/` with `createServerFileRoute()`
   - What's unclear: Exact file naming convention for parameterized server routes (e.g., does `/api/chat/stream` require `src/routes/api/chat/stream.ts` or `src/routes/api/chat.stream.ts`?)
   - Recommendation: Test during implementation; TanStack Router file conventions should apply. The `npm create @tanstack/start@latest` scaffold will clarify.

2. **Claude Code CLI process group handling**
   - What we know: `child.kill('SIGTERM')` sends signal to the child process
   - What's unclear: Whether Claude Code spawns its own child processes (e.g., for tool execution) that need separate cleanup
   - Recommendation: Use `{ detached: false }` (default) and verify that killing the main claude process cleans up its children. Monitor with `ps` during development.

3. **Drizzle ORM + sqlite-vec interop**
   - What we know: Drizzle wraps better-sqlite3 for typed queries. sqlite-vec uses raw SQL with virtual tables.
   - What's unclear: Whether Drizzle can work with sqlite-vec virtual tables or if raw SQL is needed for vector operations
   - Recommendation: Use Drizzle for session/message CRUD. Use raw `sqlite.prepare()` for sqlite-vec vector operations. Both can coexist on the same connection.

## Sources

### Primary (HIGH confidence)
- Live Claude Code CLI testing (v2.1.39) on this machine -- verified event format, flags, session_id location
- [TanStack Start Vinxi to Vite migration guide](https://blog.logrocket.com/migrating-tanstack-start-vinxi-vite/) -- verified new configuration approach
- [Claude Code headless mode docs](https://code.claude.com/docs/en/headless) -- CLI flags and usage
- [Claude Agent SDK streaming docs](https://platform.claude.com/docs/en/agent-sdk/streaming-output) -- stream event types and structure
- [sqlite-vec JS docs](https://alexgarcia.xyz/sqlite-vec/js.html) -- Node.js integration
- openclaw reference implementation (`/workspaces/assistant/openclaw/`) -- sqlite-vec loading, child process bridge, CLI backend config

### Secondary (MEDIUM confidence)
- [Drizzle ORM SQLite docs](https://orm.drizzle.team/docs/get-started-sqlite) -- schema definition, column types
- [TanStack Start server routes docs](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes) -- server route API (could not fetch full page content)
- npm version checks: @tanstack/react-start@1.159.5, drizzle-orm@0.45.1, better-sqlite3@12.6.2, sqlite-vec@0.1.7-alpha.2

### Tertiary (LOW confidence)
- TanStack Start server route SSE patterns -- based on web search results describing the pattern, not verified against official docs
- Process group behavior of Claude Code CLI -- assumption based on general Node.js child_process behavior, not tested

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- verified versions, tested locally, reference implementation available
- Architecture: HIGH -- patterns derived from official docs and verified reference implementation
- Claude CLI integration: HIGH -- live-tested NDJSON format on this machine with exact version
- TanStack Start setup: MEDIUM -- migration from Vinxi confirmed, but could not fetch full server routes documentation
- Pitfalls: HIGH -- derived from real code patterns and known Node.js stream behavior

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days -- TanStack Start is fast-moving, check for updates)
