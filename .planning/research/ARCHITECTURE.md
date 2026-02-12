# Architecture Research

**Domain:** AI assistant wrapper with web UI, CLI process management, and persistent memory
**Researched:** 2026-02-12
**Confidence:** MEDIUM-HIGH

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  TanStack Start React App                                   │    │
│  │  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐     │    │
│  │  │ Chat UI  │  │ Session List │  │ Memory Browser    │     │    │
│  │  └────┬─────┘  └──────┬───────┘  └────────┬──────────┘     │    │
│  │       │               │                    │                │    │
│  │  EventSource     Server Fns           Server Fns            │    │
│  │  (SSE stream)    (RPC)                (RPC)                 │    │
│  └───────┼───────────────┼────────────────────┼────────────────┘    │
└──────────┼───────────────┼────────────────────┼─────────────────────┘
           │               │                    │
┌──────────┼───────────────┼────────────────────┼─────────────────────┐
│          │        TanStack Start Server       │                     │
│  ┌───────▼────────┐  ┌──▼──────────┐  ┌──────▼──────────┐          │
│  │  SSE Stream    │  │  Session    │  │  Memory         │          │
│  │  Endpoint      │  │  Manager   │  │  Query API      │          │
│  │  (server route)│  │  (srvr fn) │  │  (server fn)    │          │
│  └───────┬────────┘  └──┬──────────┘  └──────┬──────────┘          │
│          │              │                    │                     │
│  ┌───────▼──────────────▼────────┐    ┌──────▼──────────┐          │
│  │    Claude Process Manager     │    │  Memory Service │          │
│  │  ┌──────────────────────┐     │    │  (query/ingest) │          │
│  │  │ child_process.spawn  │     │    └──────┬──────────┘          │
│  │  │ claude -p ...        │     │           │                     │
│  │  │ --output-format      │     │    ┌──────▼──────────┐          │
│  │  │   stream-json        │     │    │ Embedding       │          │
│  │  │ --mcp-config mcp.json│     │    │ Service         │          │
│  │  └──────────┬───────────┘     │    │ (node-llama-cpp)│          │
│  │             │ stdout (NDJSON) │    └──────┬──────────┘          │
│  │             ▼                 │           │                     │
│  │  ┌──────────────────────┐     │    ┌──────▼──────────┐          │
│  │  │ NDJSON Parser        │     │    │  SQLite + vec   │          │
│  │  │ → Event Transformer  │     │    │  (data store)   │          │
│  │  └──────────────────────┘     │    └─────────────────┘          │
│  └───────────────────────────────┘                                 │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    MCP Memory Server                         │   │
│  │    (stdio transport, spawned per Claude process)             │   │
│  │    ┌──────────┐  ┌────────────┐  ┌────────────────┐         │   │
│  │    │ remember │  │ recall     │  │ search_memory  │         │   │
│  │    │ (tool)   │  │ (tool)     │  │ (tool)         │         │   │
│  │    └──────────┘  └────────────┘  └────────────────┘         │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **TanStack Start App** | Serves React UI + SSR, defines server functions and server routes | TanStack Start with React, file-based routing |
| **Chat UI** | Renders streaming messages, handles user input, displays tool use | React components consuming SSE EventSource |
| **SSE Stream Endpoint** | Server route that bridges Claude CLI stdout to browser | `createFileRoute` with server GET handler returning `ReadableStream` |
| **Claude Process Manager** | Spawns/manages `claude -p` child processes, parses NDJSON | `child_process.spawn()` with `stdio: ['inherit', 'pipe', 'pipe']` |
| **Session Manager** | Creates, lists, resumes sessions via `--session-id` / `--resume` flags | Server functions backed by SQLite session table |
| **Memory Service** | Ingests markdown, chunks text, coordinates embedding + storage | Pure TypeScript module, orchestrates chunker + embedder + DB |
| **Embedding Service** | Generates vector embeddings from text chunks | `node-llama-cpp` with `LlamaEmbeddingContext` |
| **MCP Memory Server** | Exposes memory tools (remember, recall, search) to Claude Code | `@modelcontextprotocol/sdk` with `StdioServerTransport` |
| **SQLite + sqlite-vec** | Stores sessions, messages, memory chunks, and vector embeddings | `better-sqlite3` + `sqlite-vec` extension |
| **Memory Query API** | Lets the web UI browse/search stored memories | Server functions calling Memory Service |

## Recommended Project Structure

```
src/
├── routes/                     # TanStack Start file-based routes
│   ├── __root.tsx              # Root layout
│   ├── index.tsx               # Home / session list
│   ├── chat/
│   │   └── $sessionId.tsx      # Chat UI for a session
│   ├── memory/
│   │   └── index.tsx           # Memory browser page
│   └── api/
│       └── stream/
│           └── $sessionId.ts   # SSE streaming endpoint (server route)
├── components/                 # React UI components
│   ├── ChatMessage.tsx
│   ├── ChatInput.tsx
│   ├── StreamingMessage.tsx
│   ├── SessionList.tsx
│   └── MemoryBrowser.tsx
├── server/                     # Server-only modules
│   ├── claude/
│   │   ├── process-manager.ts  # Spawn + manage Claude CLI processes
│   │   ├── ndjson-parser.ts    # Parse stream-json NDJSON from stdout
│   │   └── event-types.ts      # TypeScript types for stream-json events
│   ├── memory/
│   │   ├── service.ts          # Memory ingestion + query orchestration
│   │   ├── chunker.ts          # Markdown → text chunks
│   │   ├── embedder.ts         # node-llama-cpp embedding wrapper
│   │   └── search.ts           # Vector similarity search via sqlite-vec
│   ├── session/
│   │   └── manager.ts          # Session CRUD, maps to Claude --resume
│   └── db/
│       ├── client.ts           # better-sqlite3 connection (WAL mode)
│       ├── schema.ts           # Table definitions + migrations
│       └── migrations/         # SQL migration files
├── mcp-server/                 # Standalone MCP server for memory tools
│   ├── index.ts                # Entry point (stdio transport)
│   ├── tools/
│   │   ├── remember.ts         # Store a memory
│   │   ├── recall.ts           # Retrieve memories by query
│   │   └── search.ts           # Semantic vector search
│   └── mcp-config.json         # Config file passed to --mcp-config
├── shared/                     # Code shared between client + server
│   ├── types.ts                # Session, Message, Memory types
│   └── constants.ts            # Shared constants
└── app.config.ts               # TanStack Start configuration
```

### Structure Rationale

- **`routes/`:** TanStack Start file-based routing. The `api/stream/$sessionId.ts` server route returns raw SSE responses, not React components. All other routes are full-stack (server-rendered React).
- **`server/`:** Server-only code that never ships to the client. Imports from here must only happen inside server functions or server routes. This boundary is enforced by `.server.ts` file conventions in TanStack Start.
- **`mcp-server/`:** Separate entry point from the main app. Built as a standalone Node.js script that Claude Code spawns via stdio. Shares the `server/db/` and `server/memory/` modules but runs in its own process.
- **`shared/`:** TypeScript types and constants used on both client and server. No runtime dependencies on server-only modules.

## Architectural Patterns

### Pattern 1: SSE Bridge (Claude CLI to Browser)

**What:** The server spawns a Claude CLI child process and bridges its NDJSON stdout stream to the browser via Server-Sent Events. The server route acts as a stateful proxy: one SSE connection per active chat.

**When to use:** Every chat interaction. This is the core data flow pattern.

**Trade-offs:** SSE is simpler than WebSockets (auto-reconnect, HTTP/2 compatible, no upgrade handshake), but is unidirectional. User messages go via separate server function calls (POST), not through the same connection. This is fine because user input is infrequent compared to streaming output.

**Example:**

```typescript
// routes/api/stream/$sessionId.ts
import { createFileRoute } from '@tanstack/react-router'
import { getOrCreateProcess } from '~/server/claude/process-manager'

export const Route = createFileRoute('/api/stream/$sessionId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { sessionId } = params
        const encoder = new TextEncoder()

        const stream = new ReadableStream({
          async start(controller) {
            const claude = await getOrCreateProcess(sessionId)

            // Forward NDJSON events as SSE
            claude.on('event', (event) => {
              const sseData = `data: ${JSON.stringify(event)}\n\n`
              controller.enqueue(encoder.encode(sseData))
            })

            claude.on('exit', () => {
              controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
              controller.close()
            })

            // Clean up on client disconnect
            request.signal.addEventListener('abort', () => {
              claude.removeAllListeners('event')
            })
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      },
    },
  },
})
```

### Pattern 2: Process Lifecycle Management

**What:** A ProcessManager singleton tracks active Claude CLI processes by session ID. It spawns new processes for new sessions, reuses running processes for follow-up messages, and handles process cleanup on exit or error.

**When to use:** All interactions with Claude Code. The manager is the single authority on running processes.

**Trade-offs:** Single-user system simplifies this enormously -- no need for process pools or user isolation. But must handle: (a) process crashes requiring restart, (b) stale processes from abandoned sessions, (c) memory pressure from too many concurrent processes.

**Example:**

```typescript
// server/claude/process-manager.ts
import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

interface ClaudeProcess extends EventEmitter {
  child: ChildProcess
  sessionId: string
  send(prompt: string): void
}

class ProcessManager {
  private processes = new Map<string, ClaudeProcess>()

  async spawn(sessionId: string, prompt: string, opts?: {
    resume?: boolean
    mcpConfig?: string
  }): Promise<ClaudeProcess> {
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--dangerously-skip-permissions',
      '--session-id', sessionId,
      '--mcp-config', opts?.mcpConfig ?? './mcp-config.json',
    ]

    if (opts?.resume) {
      args.push('--resume', sessionId)
    }

    const child = spawn('claude', args, {
      stdio: ['inherit', 'pipe', 'pipe'],
    })

    // Parse NDJSON from stdout, emit typed events
    // ... (see NDJSON parser pattern)

    return wrappedProcess
  }
}

export const processManager = new ProcessManager()
```

### Pattern 3: NDJSON Stream Parser

**What:** Claude Code CLI with `--output-format stream-json` emits newline-delimited JSON objects. Each line is a complete JSON object representing an event (init, message, tool_use, tool_result, result). The parser reads stdout line-by-line and emits typed events.

**When to use:** Parsing all Claude CLI output.

**Trade-offs:** NDJSON is simple but requires careful handling of partial lines (buffer until newline). The event types map roughly to Anthropic API streaming events but with CLI-specific wrappers.

**Example:**

```typescript
// server/claude/ndjson-parser.ts
import { Readable } from 'stream'
import { createInterface } from 'readline'
import type { StreamEvent } from './event-types'

export function parseNDJSON(
  stdout: Readable,
  onEvent: (event: StreamEvent) => void,
  onError: (err: Error) => void,
) {
  const rl = createInterface({ input: stdout })

  rl.on('line', (line) => {
    if (!line.trim()) return
    try {
      const event = JSON.parse(line) as StreamEvent
      onEvent(event)
    } catch (err) {
      onError(new Error(`Failed to parse NDJSON line: ${line}`))
    }
  })
}
```

### Pattern 4: MCP Server as Sidecar

**What:** The MCP memory server runs as a separate Node.js process, spawned by Claude Code via the `--mcp-config` flag. It communicates with Claude Code over stdio using JSON-RPC. The MCP server shares the same SQLite database as the main web server.

**When to use:** Every Claude session that needs memory access. The MCP config points Claude to the memory server.

**Trade-offs:** The MCP server and web server both access the same SQLite database. This works because: (a) SQLite in WAL mode supports concurrent readers, (b) writes are infrequent (memory storage), (c) better-sqlite3 is synchronous so no lock contention issues within a single process. The MCP server is a separate process, so it opens its own database connection.

**Example:**

```typescript
// mcp-server/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { memoryService } from './memory-service'

const server = new McpServer({
  name: 'wrex-memory',
  version: '1.0.0',
})

server.registerTool(
  'remember',
  {
    description: 'Store a fact, preference, or piece of context for later recall',
    inputSchema: {
      content: z.string().describe('The information to remember'),
      tags: z.array(z.string()).optional().describe('Optional categorization tags'),
    },
  },
  async ({ content, tags }) => {
    await memoryService.store(content, tags)
    return { content: [{ type: 'text', text: 'Memory stored successfully.' }] }
  },
)

server.registerTool(
  'recall',
  {
    description: 'Search memories by semantic similarity to a query',
    inputSchema: {
      query: z.string().describe('What to search for'),
      limit: z.number().optional().default(5).describe('Max results'),
    },
  },
  async ({ query, limit }) => {
    const results = await memoryService.search(query, limit)
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Wrex Memory MCP Server running on stdio')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
```

```json
// mcp-config.json (passed to claude --mcp-config)
{
  "mcpServers": {
    "wrex-memory": {
      "type": "stdio",
      "command": "node",
      "args": ["./dist/mcp-server/index.js"]
    }
  }
}
```

### Pattern 5: Embedding Pipeline

**What:** Markdown files or text content is split into chunks, embedded via a local GGUF model, and stored in SQLite with sqlite-vec for vector search. The pipeline is: text -> chunker -> embedder -> vec0 table insert.

**When to use:** Memory ingestion (both from MCP `remember` tool and from bulk file import).

**Trade-offs:** Local embeddings via node-llama-cpp avoid API costs and latency, but require a GGUF model file (approx 50-200MB for small embedding models like bge-small-en-v1.5). Embedding is CPU-bound and blocks the event loop unless offloaded. node-llama-cpp handles this internally with worker threads.

**Example:**

```typescript
// server/memory/embedder.ts
import { getLlama } from 'node-llama-cpp'

let embeddingContext: Awaited<ReturnType<
  Awaited<ReturnType<typeof getLlama>>['loadModel']
>>['createEmbeddingContext'] extends (...args: any) => infer R ? Awaited<R> : never

export async function initEmbedder(modelPath: string) {
  const llama = await getLlama()
  const model = await llama.loadModel({ modelPath })
  embeddingContext = await model.createEmbeddingContext()
}

export async function embed(text: string): Promise<Float32Array> {
  const embedding = await embeddingContext.getEmbeddingFor(text)
  return new Float32Array(embedding.vector)
}
```

## Data Flow

### Flow 1: User Sends a Message

```
Browser                    TanStack Start Server              Claude CLI
  │                              │                               │
  │ POST /sendMessage            │                               │
  │ (server function)            │                               │
  │─────────────────────────────>│                               │
  │                              │  spawn('claude', ['-p', msg,  │
  │                              │    '--session-id', sid,       │
  │                              │    '--output-format',         │
  │                              │    'stream-json', ...])       │
  │                              │──────────────────────────────>│
  │                              │                               │
  │  GET /api/stream/{sid}       │                               │
  │  (EventSource SSE)           │                               │
  │─────────────────────────────>│                               │
  │                              │  stdout line: {"type":"init"} │
  │                              │<──────────────────────────────│
  │  data: {"type":"init",...}   │                               │
  │<─────────────────────────────│                               │
  │                              │  stdout: {"type":"message"..} │
  │                              │<──────────────────────────────│
  │  data: {"type":"message"..}  │                               │
  │<─────────────────────────────│                               │
  │                              │  ... (tool_use, tool_result)  │
  │                              │  stdout: {"type":"result"...} │
  │                              │<──────────────────────────────│
  │  data: {"type":"result",...} │                               │
  │<─────────────────────────────│                               │
  │  event: done                 │                               │
  │<─────────────────────────────│                               │
```

### Flow 2: Claude Uses Memory Tool (MCP)

```
Claude CLI                 MCP Memory Server            SQLite + sqlite-vec
  │                              │                            │
  │  JSON-RPC: tools/call        │                            │
  │  { name: "recall",           │                            │
  │    args: { query: "..." } }  │                            │
  │─────────────────────────────>│                            │
  │                              │  embed(query) -> vector    │
  │                              │  (node-llama-cpp)          │
  │                              │                            │
  │                              │  SELECT * FROM memories    │
  │                              │  WHERE vec_distance_cosine │
  │                              │  (embedding, ?) < threshold│
  │                              │  ORDER BY distance         │
  │                              │───────────────────────────>│
  │                              │                            │
  │                              │  result rows               │
  │                              │<───────────────────────────│
  │  JSON-RPC: response          │                            │
  │  { content: [...memories] }  │                            │
  │<─────────────────────────────│                            │
  │                              │                            │
  │  (continues generating,      │                            │
  │   using memory context)      │                            │
```

### Flow 3: Memory Ingestion

```
Markdown file              Memory Service              SQLite + sqlite-vec
  │                              │                            │
  │  file content                │                            │
  │─────────────────────────────>│                            │
  │                              │                            │
  │                    chunk(text) -> chunks[]                 │
  │                              │                            │
  │                    for each chunk:                         │
  │                      embed(chunk) -> vector               │
  │                              │                            │
  │                              │  INSERT INTO memory_chunks │
  │                              │  (content, embedding,      │
  │                              │   source, tags, ...)       │
  │                              │───────────────────────────>│
  │                              │                            │
  │                    (sqlite-vec indexes vector              │
  │                     in vec0 virtual table)                 │
```

### Key Data Flows

1. **Chat streaming:** Browser -> server function (prompt) -> spawn Claude CLI -> parse NDJSON stdout -> SSE to browser. Bidirectional but asymmetric: messages sent via POST, responses streamed via SSE.
2. **Memory access (MCP):** Claude CLI <-> MCP server over stdio JSON-RPC. Claude decides when to call memory tools. The web server is not in this loop.
3. **Memory ingestion:** Web UI or CLI trigger -> Memory Service -> chunker -> embedder -> SQLite insert. Can happen independently of chat.
4. **Session management:** Server functions for CRUD. Claude CLI sessions tracked via `--session-id` UUID. Session metadata stored in SQLite. Resume via `--resume` flag.

## Database Schema Design

```sql
-- Core tables
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,           -- UUID, used as Claude --session-id
  name TEXT,                     -- Human-readable session name
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata TEXT                  -- JSON blob for extra info
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,            -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,         -- Full message content
  tool_use TEXT,                 -- JSON: tool calls made in this message
  created_at TEXT NOT NULL
);

CREATE TABLE memory_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,         -- The text chunk
  source TEXT,                   -- File path or 'conversation'
  tags TEXT,                     -- JSON array of tags
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- sqlite-vec virtual table for vector search
CREATE VIRTUAL TABLE memory_embeddings USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding float[384]           -- Dimension matches model (bge-small = 384)
);

-- Indexes
CREATE INDEX idx_messages_session ON messages(session_id, created_at);
CREATE INDEX idx_memory_tags ON memory_chunks(tags);
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single user (target) | Monolith is perfect. One SQLite file, one server process, processes spawned on demand. better-sqlite3 with WAL mode handles concurrent reads from web server + MCP server. |
| 2-5 concurrent sessions | Still fine. Each session spawns a Claude CLI process (each ~50-100MB RSS). Monitor total memory. Consider process limits. |
| Heavy memory DB (100k+ chunks) | sqlite-vec handles this well with chunked storage. May want to use int8 vectors instead of float32 to reduce memory/disk. Consider periodic VACUUM. |
| Large model files | node-llama-cpp loads model into memory once. With bge-small-en-v1.5 (~130MB GGUF), this is fine. Avoid loading multiple models simultaneously. |

### Scaling Priorities

1. **First bottleneck: Claude CLI process memory.** Each spawned process uses significant RAM. With `--dangerously-skip-permissions`, processes run until completion. Implement a max concurrent process limit (e.g., 3) and queue additional requests.
2. **Second bottleneck: Embedding throughput.** Bulk ingestion of many files will be CPU-bound. Consider batching and background processing rather than blocking the web server.

## Anti-Patterns

### Anti-Pattern 1: WebSocket Instead of SSE

**What people do:** Use WebSocket for the streaming connection between browser and server.
**Why it's wrong:** WebSocket requires an upgrade handshake, doesn't auto-reconnect, doesn't work through HTTP/2 proxies as cleanly, and adds bidirectional complexity when the data flow is fundamentally unidirectional (server -> client). User messages are separate POST requests.
**Do this instead:** Use SSE via a TanStack Start server route. Browser uses native `EventSource` which handles reconnection automatically. Send user messages via server functions (POST).

### Anti-Pattern 2: Piping stdin to Claude CLI for Follow-up Messages

**What people do:** Keep a long-running Claude process and pipe additional user messages to its stdin.
**Why it's wrong:** Claude Code CLI in `-p` mode processes one prompt and exits. It is not an interactive REPL when used programmatically. Session continuity is handled by the `--resume` flag, not by keeping a process alive.
**Do this instead:** Spawn a new `claude -p` process for each user message, using `--resume <sessionId>` to continue the conversation. Claude Code handles session persistence internally.

### Anti-Pattern 3: Sharing better-sqlite3 Connection Across Processes

**What people do:** Try to share a single database connection between the web server and the MCP server process.
**Why it's wrong:** Each process needs its own connection. better-sqlite3 connections cannot be shared across process boundaries. Attempting to do so via IPC would be fragile and slow.
**Do this instead:** Each process (web server, MCP server) opens its own better-sqlite3 connection to the same database file. SQLite in WAL mode supports concurrent readers and serializes writes automatically. This is the designed usage pattern.

### Anti-Pattern 4: Embedding at Query Time

**What people do:** Generate embeddings for memory chunks on every search query, or re-embed stored chunks instead of caching embeddings.
**Why it's wrong:** Embedding is relatively slow (10-100ms per chunk even locally). Re-embedding stored content on every query wastes CPU and adds latency.
**Do this instead:** Embed chunks once at ingestion time and store the vectors in sqlite-vec. At query time, only embed the search query (single embedding call), then use sqlite-vec's KNN search to find similar stored vectors.

### Anti-Pattern 5: Coupling MCP Server Logic to Web Server Process

**What people do:** Try to run the MCP server as a module within the TanStack Start server process.
**Why it's wrong:** Claude Code spawns MCP servers as child processes via stdio. The MCP server must be a standalone executable that communicates via stdin/stdout. It cannot run inside the web server.
**Do this instead:** Build the MCP server as a separate entry point (`mcp-server/index.ts`) that compiles to its own bundle. Share database access code and memory service logic via shared modules, but maintain separate entry points and process lifecycles.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude Code CLI | `child_process.spawn()` with NDJSON stdout parsing | Must use `stdio: ['inherit', 'pipe', 'pipe']` -- piping stdin causes hangs. Use `--dangerously-skip-permissions` which must be accepted interactively first (one-time setup). |
| Anthropic API (indirect) | Via Claude Code CLI, not direct | Claude Code handles API auth, model selection, context windows. Wrex does not call the Anthropic API directly. |
| node-llama-cpp | `getLlama()` -> `loadModel()` -> `createEmbeddingContext()` | Model loaded once at server startup, reused for all embedding calls. Must use same model file for all embeddings (cannot mix models). |
| sqlite-vec | `sqliteVec.load(db)` on better-sqlite3 instance | Load extension after opening connection. Both web server and MCP server load the extension independently. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Browser <-> Web Server (streaming) | SSE via EventSource / server route | Unidirectional: server -> client. Client disconnect detected via `request.signal` abort. |
| Browser <-> Web Server (actions) | Server functions (RPC over POST) | Bidirectional: client calls server function, gets return value. Type-safe across boundary. |
| Web Server <-> Claude CLI | child_process.spawn, stdout pipe | One process per user message. Process exits after response complete. |
| Claude CLI <-> MCP Server | stdio JSON-RPC (MCP protocol) | Claude Code spawns MCP server, communicates via stdin/stdout. Web server is not involved. |
| Web Server <-> SQLite | better-sqlite3 (synchronous, in-process) | Direct file access. WAL mode for concurrent reads. |
| MCP Server <-> SQLite | better-sqlite3 (synchronous, in-process) | Separate connection, same database file. WAL mode required. |
| MCP Server <-> Embedding Model | node-llama-cpp (in-process) | Embedding model loaded in MCP server process. May also be loaded in web server for memory browser search. |

## Build Order (Dependencies)

This section informs phase structure in the roadmap. Components have clear dependency chains:

### Tier 1: Foundation (no dependencies)
1. **SQLite database layer** -- schema, migrations, better-sqlite3 + sqlite-vec setup, WAL mode
2. **TanStack Start skeleton** -- basic routing, SSR, dev server

### Tier 2: Core Features (depends on Tier 1)
3. **Claude Process Manager** -- spawn CLI, parse NDJSON, emit typed events (depends on nothing, but needs DB for session tracking)
4. **SSE streaming endpoint** -- server route bridging process manager to browser (depends on #3)
5. **Chat UI** -- React components consuming SSE stream (depends on #4)

### Tier 3: Session Management (depends on Tier 2)
6. **Session CRUD** -- create, list, resume sessions (depends on DB + process manager)
7. **Session UI** -- session list, resume functionality (depends on #6)

### Tier 4: Memory System (depends on Tier 1, parallel to Tier 2/3)
8. **Embedding service** -- node-llama-cpp wrapper, model loading (depends on nothing)
9. **Memory service** -- chunker + embedder + SQLite storage (depends on #1 + #8)
10. **MCP memory server** -- expose memory tools via MCP protocol (depends on #9)
11. **MCP integration** -- wire `--mcp-config` into process manager (depends on #3 + #10)

### Tier 5: Polish (depends on everything)
12. **Memory browser UI** -- search/browse memories from web UI (depends on #9)
13. **Session history persistence** -- store full message history in SQLite (depends on #6)

**Key insight:** The memory system (Tier 4) can be built in parallel with the chat system (Tiers 2-3). They converge only when the MCP server is wired into the process manager. This suggests a roadmap with parallel workstreams or interleaved phases.

## Sources

- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) -- official docs, HIGH confidence
- [Claude Code MCP Configuration](https://code.claude.com/docs/en/mcp) -- official docs, HIGH confidence
- [Claude Code spawn from Node.js issue #771](https://github.com/anthropics/claude-code/issues/771) -- GitHub issue (closed/resolved), HIGH confidence on stdio workaround
- [Claude Code Stream-JSON Chaining](https://github.com/ruvnet/claude-flow/wiki/Stream-Chaining) -- community wiki, MEDIUM confidence on event types
- [TanStack Start Server Routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes) -- official docs, HIGH confidence
- [TanStack Start Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) -- official docs, HIGH confidence
- [TanStack Start SSE with DynamoDB example](https://johanneskonings.dev/blog/2026-01-08-tanstack-start-aws-db-multiple-entities-sse/) -- blog (Jan 2026), MEDIUM confidence on SSE pattern
- [MCP TypeScript SDK - Build Server](https://modelcontextprotocol.io/docs/develop/build-server) -- official MCP docs, HIGH confidence
- [MCP TypeScript SDK on GitHub](https://github.com/modelcontextprotocol/typescript-sdk) -- official, HIGH confidence
- [sqlite-vec Node.js usage](https://alexgarcia.xyz/sqlite-vec/js.html) -- official sqlite-vec docs, HIGH confidence
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) -- official, HIGH confidence
- [node-llama-cpp Embedding Guide](https://node-llama-cpp.withcat.ai/guide/embedding) -- official docs, HIGH confidence
- [better-sqlite3 Performance/WAL](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) -- official docs, HIGH confidence
- [Scott Spence: Configuring MCP in Claude Code](https://scottspence.com/posts/configuring-mcp-tools-in-claude-code) -- blog, MEDIUM confidence

---
*Architecture research for: Wrex AI Assistant Wrapper*
*Researched: 2026-02-12*
