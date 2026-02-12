# Stack Research

**Domain:** AI assistant web wrapper with persistent memory (TypeScript full-stack)
**Researched:** 2026-02-12
**Confidence:** MEDIUM-HIGH (most choices verified via npm/official docs; TanStack Start is RC-stable but not GA)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TanStack Start | ^1.120.20 | Full-stack React meta-framework | Built on Vite (migrated from Vinxi in v1.121.0), type-safe server functions via `createServerFn`, file-based routing with server routes for SSE endpoints. RC-stable with finalized API. Only React meta-framework with first-class TanStack Router integration. |
| TanStack Router | ^1.159.5 | Type-safe routing | Comes bundled with Start. Full type inference for route params, search params, and loaders. File-based routing with `routeTree.gen.ts` auto-generation. |
| React | ^19.2.4 | UI framework | Required by TanStack Start. React 19 provides Server Components support, `use()` hook, and improved Suspense. |
| TypeScript | ^5.9.3 | Type safety | Required by node-llama-cpp (>=5.0.0) and TanStack ecosystem. v5.9 has satisfies operator, decorator metadata, and bundler module resolution. |
| Vite | ^7.3.1 | Build tool / dev server | TanStack Start's build system since the Vinxi migration. Fast HMR, SSR support, plugin ecosystem. |
| Node.js | >=20.0.0 | Runtime | Required by node-llama-cpp. Use Node 22 LTS for best performance and native fetch. |

### Database Layer

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| better-sqlite3 | ^12.6.2 | SQLite driver | Synchronous API is ideal for server-side use. Required as the base driver for sqlite-vec extension loading. Fastest Node.js SQLite driver -- no async overhead for single-user app. |
| sqlite-vec | ^0.1.7-alpha.2 | Vector search extension | Pure C, zero dependencies. Loads into better-sqlite3 via `sqliteVec.load(db)`. Creates `vec0` virtual tables for KNN search. The only viable SQLite vector extension that runs everywhere without external dependencies. |
| Drizzle ORM | ^0.45.1 | SQL query builder / schema | Type-safe, SQL-first ORM. Uses better-sqlite3 as driver. For standard CRUD on sessions, messages, memories. Use `db.execute(sql\`...\`)` for sqlite-vec virtual table queries that Drizzle's query builder cannot express. |
| drizzle-kit | ^0.31.9 | Schema migrations | Generates SQL migrations from Drizzle schema files. Pair with `drizzle-orm/better-sqlite3` driver. |
| SQLite FTS5 | built-in | Full-text keyword search | Ships with SQLite. No extra extension needed. Use alongside sqlite-vec for hybrid search (RRF scoring). Create `fts5` virtual tables with `content=` pointing to base table. |

### AI / Embedding Layer

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| node-llama-cpp | ^3.15.1 | Local GGUF model inference for embeddings | Native Node.js bindings to llama.cpp. `model.createEmbeddingContext()` then `context.getEmbeddingFor(text)` returns `LlamaEmbedding` with `.vector` (Float32Array). Runs entirely local -- no API calls, no cost, no latency to external services. |
| nomic-embed-text-v1.5 (GGUF Q8_0) | - | Embedding model | 137MB, 768-dim vectors, excellent accuracy/speed tradeoff. Outperforms bge-small on MTEB. Supports long context (8192 tokens). Use Q8_0 quantization for best accuracy at reasonable size. |
| @anthropic-ai/claude-agent-sdk | ^0.2.39 | Programmatic Claude Code integration | The official TypeScript SDK for Claude Code. Provides `query()` async generator for streaming messages, `resume` for session continuity, built-in MCP server support via `createSdkMcpServer()`. Replaces raw CLI process spawning with a proper API. |

### MCP (Model Context Protocol) Layer

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @modelcontextprotocol/sdk | ^1.26.0 | MCP server for memory tools | Official TypeScript SDK. Use `McpServer` + `StdioServerTransport` for a standalone MCP server, OR use Agent SDK's `createSdkMcpServer()` for in-process MCP. Register `memory_search` and `memory_get` tools with Zod schemas. |
| zod | ^4.3.6 | Schema validation | Required by Claude Agent SDK (peer dep: ^4.0.0). MCP SDK supports ^3.25 or ^4.0. Use v4 throughout -- 14x faster parsing than v3, 57% smaller. Unified error API. |

### UI Layer

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TanStack Query | ^5.90.21 | Server state management | Built-in integration with TanStack Start loaders. Handles caching, refetching, optimistic updates for session list, memory queries. |
| Tailwind CSS | ^4.1.18 | Styling | v4 has native Vite plugin (`@tailwindcss/vite`), CSS-first configuration (no tailwind.config.js). Lightning CSS under the hood. Standard for utility-first styling. |
| @tailwindcss/vite | ^4.1.18 | Vite integration for Tailwind | Native Vite plugin replaces PostCSS setup. Faster builds, better HMR. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nanoid | ^5.1.5 | ID generation | Session IDs, memory IDs. Already a dep of node-llama-cpp. Shorter and URL-safe compared to UUIDs. |
| date-fns | ^4.x | Date formatting | Display timestamps in UI. Tree-shakeable, no global mutation (unlike moment/dayjs). |
| marked | ^15.x | Markdown rendering | Render Claude's markdown responses in the UI. Fast, spec-compliant. |
| DOMPurify | ^3.x | HTML sanitization | Sanitize rendered markdown before insertion. Prevents XSS from Claude's output. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| @tanstack/router-devtools | Route debugging | Shows route tree, params, loaders in browser devtools. Only in dev mode. |
| @tanstack/query-devtools | Query cache inspection | Visualize cache state, refetch triggers. Only in dev mode. |
| drizzle-kit | Schema management | `npx drizzle-kit generate` for migrations, `npx drizzle-kit push` for quick iteration. |
| vitest | Testing | Vite-native test runner. Same transform pipeline as the app. Use for unit tests on memory search logic, embedding pipeline. |
| @types/better-sqlite3 | TypeScript types | Type definitions for better-sqlite3 driver. |

## Installation

```bash
# Core framework
npm install @tanstack/start @tanstack/react-router @tanstack/react-query react react-dom

# Database
npm install better-sqlite3 sqlite-vec drizzle-orm

# AI / Embeddings
npm install node-llama-cpp @anthropic-ai/claude-agent-sdk

# MCP
npm install @modelcontextprotocol/sdk zod

# UI
npm install @tailwindcss/vite tailwindcss

# Supporting
npm install nanoid

# Dev dependencies
npm install -D typescript @types/react @types/react-dom @types/better-sqlite3
npm install -D drizzle-kit vitest
npm install -D @tanstack/router-devtools @tanstack/query-devtools
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| TanStack Start | Next.js | If you need GA stability guarantees or a larger ecosystem of deployment adapters. TanStack Start is RC but API-stable; Next.js has broader community. For Wrex, Start's type-safe server functions and SSE support outweigh Next.js's maturity. |
| TanStack Start | Remix / React Router v7 | If you prefer loader/action patterns over server functions. Remix is solid but lacks TanStack Router's type inference depth. |
| better-sqlite3 | node:sqlite (built-in) | When Node.js ships stable native SQLite (currently experimental). Cannot load extensions like sqlite-vec yet. Wait for Node 24+. |
| better-sqlite3 | libSQL | If you need Turso cloud replication later. For single-VM, better-sqlite3 is simpler and has wider sqlite-vec community usage. |
| Drizzle ORM | Raw better-sqlite3 | If you want zero abstraction. Drizzle adds type safety for standard CRUD while allowing raw SQL for vec0/FTS5 queries. The hybrid approach is worth the small dependency. |
| Drizzle ORM | Prisma | Never for this project. Prisma cannot handle custom SQLite extensions, virtual tables, or raw `db.execute()` for vec0 queries. Its migration system fights with FTS5/vec0 DDL. |
| node-llama-cpp | Ollama | If you want a managed embedding service. Adds a separate process and HTTP overhead. node-llama-cpp runs in-process with native bindings -- lower latency, simpler deployment for single-user. |
| @anthropic-ai/claude-agent-sdk | Spawning `claude` CLI via child_process | If the Agent SDK's ~12s cold start per session is unacceptable. The SDK now supports streaming input mode where subsequent messages drop to ~2-3s. For Wrex, the SDK is strictly better: proper TypeScript types, `resume` support, in-process MCP via `createSdkMcpServer()`, and no stdout parsing. |
| nomic-embed-text-v1.5 | bge-small-en-v1.5 | If you need the absolute smallest model (33MB). bge-small has 384-dim vectors and is faster but less accurate. nomic-embed at 137MB is a better accuracy/size balance for a VM with adequate RAM. |
| nomic-embed-text-v1.5 | nomic-embed-text-v2 (MoE) | If you need multilingual. v2 uses Mixture-of-Experts (475M params, 305M active). Larger and slower. Stick with v1.5 for English-only personal assistant. |
| Tailwind CSS v4 | CSS Modules | If you prefer colocated styles. Tailwind v4's Vite plugin is fast and well-integrated with the TanStack Start build pipeline. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Prisma | Cannot handle sqlite-vec virtual tables, FTS5 DDL, or extension loading. Migration system fights custom SQL. | Drizzle ORM + raw SQL for vec0/FTS5 |
| sqlite-vss | Predecessor to sqlite-vec. Depends on Faiss (large C++ dependency). Deprecated in favor of sqlite-vec. | sqlite-vec |
| Vinxi | TanStack Start migrated away from Vinxi to Vite in v1.121.0 (June 2025). Old tutorials reference it; ignore them. | Vite (built into TanStack Start) |
| express / fastify | TanStack Start has its own server with server functions and server routes. Adding Express creates two servers and complicates SSR. | TanStack Start server routes |
| LangChain.js | Massive dependency, unnecessary abstraction for this use case. You need exactly one thing: `getEmbeddingFor(text)`. | node-llama-cpp direct API |
| WebSocket for streaming | SSE (Server-Sent Events) is simpler, HTTP-native, and sufficient for server-to-client streaming of Claude's responses. WebSocket adds bidirectional complexity you don't need. | SSE via TanStack Start server routes |
| Raw `child_process.spawn('claude')` | Fragile stdout/stderr parsing, no TypeScript types, no session management, no in-process MCP. | @anthropic-ai/claude-agent-sdk |
| Zod v3 | Claude Agent SDK requires Zod ^4.0.0 as a peer dependency. Using v3 will cause peer dep conflicts. | zod ^4.3.6 |

## Stack Patterns by Variant

**For the MCP server (memory tools):**
- Two options: standalone stdio MCP server OR in-process via Agent SDK's `createSdkMcpServer()`
- Recommendation: Use `createSdkMcpServer()` from Agent SDK. It runs in the same process, avoids stdio serialization overhead, and tools are registered with the `tool()` helper using Zod schemas.
- Fallback: If you need the MCP server to also serve other clients (e.g., direct Claude Code interactive mode), build a standalone stdio server with `@modelcontextprotocol/sdk` that can be pointed to from `.claude/settings.json`.

**For vector search queries (sqlite-vec):**
- Drizzle ORM handles standard CRUD (sessions, messages, memory metadata)
- sqlite-vec queries use `db.execute(sql\`...\`)` through Drizzle's raw SQL escape hatch
- Pattern: `db.execute(sql\`SELECT rowid, distance FROM vec_memories WHERE embedding MATCH ${vectorBuffer} ORDER BY distance LIMIT 10\`)`
- Vectors are bound as `Float32Array` buffers via `.buffer` accessor

**For hybrid search (FTS5 + sqlite-vec):**
- Execute FTS5 and vec0 queries separately
- Combine with Reciprocal Rank Fusion: `score = 1/(k + fts_rank) + 1/(k + vec_rank)` with k=60
- Implement as a TypeScript function, not as a single SQL query, for clarity and maintainability

**For Claude Code session management:**
- Use Agent SDK's `query()` with `resume: sessionId` to continue sessions
- Use streaming input mode (`prompt: AsyncIterable<SDKUserMessage>`) to keep the process warm between turns (~2-3s vs ~12s cold start)
- Store `session_id` from `SDKResultMessage` in SQLite for persistence across server restarts

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| @tanstack/start@^1.120.20 | react@^19.2, vite@^7.x | Start uses Vite 7 internally. TanStack Start Vite plugin must come BEFORE React plugin in vite.config.ts. |
| drizzle-orm@^0.45.1 | better-sqlite3@^12.x | Use `drizzle(database)` from `drizzle-orm/better-sqlite3`. |
| sqlite-vec@^0.1.7-alpha.2 | better-sqlite3@^12.x | Load via `sqliteVec.load(db)` where `db` is a better-sqlite3 instance. |
| node-llama-cpp@^3.15.1 | Node.js >=20, TypeScript >=5.0 | Requires cmake-js build toolchain. First `npm install` compiles native bindings. |
| @anthropic-ai/claude-agent-sdk@^0.2.39 | zod@^4.0.0 | Hard peer dependency on Zod 4. Will not work with Zod 3. |
| @modelcontextprotocol/sdk@^1.26.0 | zod@^3.25 or ^4.0 | Supports both Zod 3 and 4. Use v4 to match Agent SDK requirement. |
| tailwindcss@^4.1.18 | vite@^7.x via @tailwindcss/vite | v4 uses CSS-first config (`@theme` directives in CSS). No tailwind.config.js needed. |

## Critical Notes

### Agent SDK vs CLI: Decision Rationale
The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is the correct choice over raw CLI spawning because:
1. **In-process MCP**: `createSdkMcpServer()` + `tool()` lets you register memory tools that the agent can call without a separate stdio server process.
2. **Streaming input mode**: Keep process warm between turns for ~2-3s response time (vs ~12s cold start per `query()` call).
3. **Typed messages**: `SDKMessage` union type with `SDKAssistantMessage`, `SDKPartialAssistantMessage` (for streaming), and `SDKResultMessage` (for completion with usage stats).
4. **Session resume**: `options.resume: sessionId` continues a conversation. `options.forkSession: true` forks to a new session.
5. **Permission control**: `permissionMode: 'bypassPermissions'` with `allowDangerouslySkipPermissions: true` for automated operation. Or use `canUseTool` callback for fine-grained control.

### sqlite-vec Alpha Status
sqlite-vec is at v0.1.7-alpha.2. This is the latest published version and has been stable in practice. The "alpha" tag reflects the author's versioning conservatism, not instability. The API (`vec0` virtual tables, `MATCH` operator) is settled. Metadata filtering is planned but not yet available -- filter in application code post-query for now.

### TanStack Start RC Status
TanStack Start is at v1.120.20 RC. The API is finalized and considered stable. The RC designation means it is preparing for GA but accepting final feedback. The Vite migration (from Vinxi) happened in v1.121.0 and is now the only supported build system. Tutorials referencing `app.config.ts`, `createAPIFileRoute()`, or Vinxi are outdated -- use `vite.config.ts` and `createServerFileRoute().methods()` for server routes.

### Embedding Model Download
node-llama-cpp can download GGUF models programmatically. For first-run setup, download nomic-embed-text-v1.5-Q8_0.gguf (~137MB) from HuggingFace. Store in a `models/` directory. The model path is passed to `getLlama()` then `llama.loadModel(modelPath)`.

## Sources

- npm registry (direct version queries) -- all version numbers verified 2026-02-12 [HIGH confidence]
- [TanStack Start Overview](https://tanstack.com/start/latest/docs/framework/react/overview) -- RC status, feature set [HIGH confidence]
- [TanStack Start v1 RC Announcement](https://tanstack.com/blog/announcing-tanstack-start-v1) -- release status [HIGH confidence]
- [Migrating TanStack Start from Vinxi to Vite](https://blog.logrocket.com/migrating-tanstack-start-vinxi-vite/) -- build system change [MEDIUM confidence]
- [node-llama-cpp Embedding Guide](https://node-llama-cpp.withcat.ai/guide/embedding) -- embedding API [HIGH confidence]
- [Claude Code Headless Mode / Agent SDK](https://code.claude.com/docs/en/headless) -- CLI flags, now Agent SDK [HIGH confidence]
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) -- full API types and patterns [HIGH confidence]
- [Agent SDK 12s overhead issue #34](https://github.com/anthropics/claude-agent-sdk-typescript/issues/34) -- performance, streaming input solution [HIGH confidence]
- [sqlite-vec JS Integration](https://alexgarcia.xyz/sqlite-vec/js.html) -- better-sqlite3 loading pattern [HIGH confidence]
- [Hybrid Search with sqlite-vec + FTS5](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) -- RRF scoring pattern [MEDIUM confidence]
- [Drizzle ORM SQLite Getting Started](https://orm.drizzle.team/docs/get-started-sqlite) -- driver integration [HIGH confidence]
- [Drizzle ORM sql`` operator](https://orm.drizzle.team/docs/sql) -- raw SQL for vec0 queries [HIGH confidence]
- [MCP TypeScript SDK server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) -- tool registration [HIGH confidence]
- [Best Embedding Models 2026](https://elephas.app/blog/best-embedding-models) -- model comparison [MEDIUM confidence]
- [Zod v4 Release Notes](https://zod.dev/v4) -- v4 stability, performance [HIGH confidence]
- [TanStack Start Server Routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes) -- SSE endpoint capability [MEDIUM confidence]
- [TanStack AI SSE Protocol](https://tanstack.com/ai/latest/docs/protocol/sse-protocol) -- SSE utilities [MEDIUM confidence]

---
*Stack research for: Wrex -- AI assistant web wrapper with persistent memory*
*Researched: 2026-02-12*
