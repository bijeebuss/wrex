# Project Research Summary

**Project:** Wrex
**Domain:** Personal AI assistant -- web wrapper around Claude Code CLI with persistent memory
**Researched:** 2026-02-12
**Confidence:** MEDIUM-HIGH

## Executive Summary

Wrex is a single-user web interface that wraps Claude Code CLI with a persistent, searchable memory system. The established pattern for building this kind of product is a TanStack Start full-stack React app that spawns Claude Code as child processes, bridges their NDJSON streaming output to the browser via Server-Sent Events (SSE), and exposes memory tools through a Model Context Protocol (MCP) server that Claude Code calls natively. The stack is TypeScript end-to-end: TanStack Start for the web framework, better-sqlite3 with sqlite-vec and FTS5 for storage and search, node-llama-cpp for local embeddings, and the MCP SDK for tool exposure. No existing Claude Code web wrapper has a memory system -- this is Wrex's clear competitive differentiator.

The recommended approach is to build two parallel foundations: (1) a reliable CLI process manager that spawns Claude Code, parses NDJSON streams, and bridges them to the browser, and (2) a memory pipeline that chunks markdown files, embeds them locally, and stores vectors in sqlite-vec for hybrid search. These two foundations converge when the MCP memory server is wired into Claude Code's process invocation via `--mcp-config`. The chat UI and session management layer on top of the process manager, while the memory browser UI layers on top of the memory service.

The critical risks are concentrated in three areas: (1) NDJSON stream parsing -- stdout arrives in arbitrary chunks that split JSON lines, and naive parsing silently drops events; (2) child process lifecycle management -- Claude Code processes that are not properly tracked and cleaned up accumulate as zombies and eventually exhaust system resources; and (3) streaming UI performance -- token-level React state updates at 10-50Hz cause render jank unless batched and decoupled from markdown rendering. All three have well-documented solutions, but each must be addressed in its correct phase rather than retrofitted.

## Key Findings

### Recommended Stack

The stack centers on TanStack Start (RC-stable, Vite-based) as the full-stack React framework, providing type-safe server functions for RPC and server routes for SSE streaming. SQLite serves as the single storage engine: better-sqlite3 for synchronous access, sqlite-vec for vector search via virtual tables, FTS5 for keyword search, and Drizzle ORM for type-safe CRUD with raw SQL escape hatches for vec0/FTS5 queries. Local embeddings use node-llama-cpp with the nomic-embed-text-v1.5 GGUF model (768-dim, 137MB, Q8_0 quantization). The Claude Agent SDK is recommended over raw CLI spawning for its typed API, session resume, and in-process MCP support.

**Core technologies:**
- **TanStack Start** (^1.120.20): Full-stack React meta-framework -- type-safe server functions, file-based routing, SSE via server routes
- **better-sqlite3 + sqlite-vec + FTS5**: Storage and search -- synchronous SQLite with vector similarity and full-text keyword search
- **Drizzle ORM** (^0.45.1): Type-safe SQL -- standard CRUD with raw SQL escape hatch for vec0/FTS5 virtual table queries
- **node-llama-cpp** (^3.15.1): Local embeddings -- in-process GGUF model inference, no external API, no cost
- **nomic-embed-text-v1.5** (Q8_0 GGUF): Embedding model -- 768-dim, 137MB, strong accuracy/size tradeoff for English
- **@anthropic-ai/claude-agent-sdk** (^0.2.39): Claude Code integration -- typed streaming, session resume, in-process MCP via `createSdkMcpServer()`
- **@modelcontextprotocol/sdk** (^1.26.0): MCP server -- memory tools exposed to Claude Code over stdio JSON-RPC
- **Zod v4** (^4.3.6): Schema validation -- required by Agent SDK (hard peer dep), 14x faster than v3

**Critical version notes:**
- Zod v4 is a hard requirement (Agent SDK peer dep). Do not use v3.
- TanStack Start migrated from Vinxi to Vite in v1.121.0. Ignore any tutorial referencing Vinxi or `app.config.ts`.
- node-llama-cpp requires Node.js >= 20 and TypeScript >= 5.0.

### Expected Features

**Must have (table stakes):**
- Streaming chat interface with real-time token display, markdown rendering, and code highlighting
- Session management: new session, session list sidebar, resume previous session
- Memory storage as markdown files (source of truth, human-readable, git-friendly)
- MCP server with `memory_search`, `memory_get`, `memory_write` tools
- Hybrid search combining sqlite-vec vector similarity and FTS5 keyword ranking via RRF
- Error handling with recovery (CLI crashes, stream interruptions, timeouts)
- Loading/thinking indicators during Claude Code startup delay (2-5 seconds)

**Should have (differentiators):**
- Automatic context injection from memory on each conversation
- Memory compaction before context window fills (persist important information)
- Tool use visibility in collapsible UI blocks (builds trust, aids debugging)
- Memory browser UI for browsing, reading, and editing memory files
- Project/workspace context scoping sessions and memory to directories
- Configurable tool permissions (autonomy dial from strict to permissive)

**Defer (v2+):**
- File diff display for code changes (needs robust tool visibility pipeline first)
- Session-to-memory extraction (needs reliable memory write + good heuristics)
- Smart session suggestions (needs substantial history to be useful)
- Keyboard shortcuts (low effort but not needed until daily-driver usage)

**Anti-features (explicitly not building):**
- Multi-user auth (network-level access control instead)
- Multi-model support (Claude Code only -- the value is the integration)
- Voice input/output (target user is a developer who types)
- Plugin system (MCP IS the extension mechanism)
- RAG over arbitrary documents (different product)

### Architecture Approach

The architecture is a monolithic TanStack Start server with clear internal boundaries. The browser connects via SSE for streaming responses and server functions (RPC over POST) for actions. The server manages Claude Code child processes, each producing NDJSON stdout that is parsed and forwarded as SSE events. A separate MCP memory server runs as a sidecar process spawned by Claude Code via `--mcp-config`, sharing the same SQLite database file (WAL mode enables concurrent access). The memory pipeline -- chunker, embedder (node-llama-cpp), and sqlite-vec storage -- is shared code used by both the MCP server and the web server's memory query API.

**Major components:**
1. **SSE Stream Endpoint** -- Server route bridging Claude CLI NDJSON stdout to browser EventSource
2. **Claude Process Manager** -- Spawns/tracks/cleans up Claude CLI child processes per session
3. **NDJSON Parser** -- Line-buffered transform stream for reliable JSON event extraction
4. **Session Manager** -- CRUD for sessions backed by SQLite, maps to Claude `--resume` flag
5. **Memory Service** -- Orchestrates markdown chunking, embedding, and sqlite-vec storage
6. **Embedding Service** -- node-llama-cpp wrapper, model loaded eagerly at startup as singleton
7. **MCP Memory Server** -- Standalone stdio process exposing remember/recall/search tools
8. **SQLite Layer** -- better-sqlite3 + sqlite-vec + FTS5 in WAL mode, Drizzle ORM for CRUD

**Key architectural decisions:**
- Two-table pattern for sqlite-vec: metadata in `memory_chunks`, vectors in `vec_memories` virtual table, joined by rowid
- SSE (not WebSocket) for streaming: unidirectional, auto-reconnect, HTTP/2 compatible
- One Claude process per user message with `--resume` for continuity (not a long-running REPL)
- MCP server as separate process (required by Claude Code's stdio transport), not embedded in web server

### Critical Pitfalls

1. **NDJSON stream splitting at chunk boundaries** -- Node.js delivers stdout in arbitrary chunks that split JSON lines. Implement line-buffered parsing with a string buffer that holds incomplete trailing lines. Must be correct from day one as every downstream feature depends on it.

2. **Claude Code child process zombie accumulation** -- Processes not properly terminated become zombies, eventually exhausting system resources. Track all PIDs, kill children on parent exit/signal, implement a watchdog for stale processes, always set `--max-turns` to prevent infinite loops.

3. **Streaming UI renders 10-50x/sec causing jank** -- Token-level React state updates trigger expensive markdown re-rendering on every token. Batch token updates at 50-100ms intervals, render as plain text during streaming, apply full markdown only after stream completes or pauses.

4. **sqlite-vec virtual table impedance mismatch** -- Vectors must live in separate virtual tables, not alongside metadata. Design the two-table schema from the start. Recovery cost is HIGH if you get this wrong (requires full data migration and re-embedding).

5. **MCP server stdout corruption via console.log** -- Any `console.log()` in MCP server code writes to stdout, corrupting the JSON-RPC protocol stream. Use `console.error()` exclusively. Establish this as a project convention and enforce with linting.

6. **node-llama-cpp model loading blocks event loop** -- Loading the GGUF model is synchronous and takes 2-10 seconds. Load eagerly at server startup before accepting connections, never lazily on first request.

7. **SSE connection limits under HTTP/1.1** -- Browsers limit to 6 connections per domain. Use HTTP/2 from the start, or multiplex sessions over a single SSE connection.

## Implications for Roadmap

Based on the architecture's dependency tiers and the pitfall-to-phase mapping, the project naturally decomposes into 5 phases with two parallel workstreams (chat system and memory system) that converge in phase 4.

### Phase 1: Foundation and CLI Process Wrapper
**Rationale:** Everything depends on reliable CLI process management and database infrastructure. The two most critical pitfalls (NDJSON splitting and zombie processes) must be solved here. This phase has zero external dependencies.
**Delivers:** SQLite database with schema and migrations, Claude Process Manager with NDJSON parsing, basic TanStack Start skeleton with dev server running.
**Addresses features:** None user-facing -- this is pure infrastructure.
**Avoids pitfalls:** NDJSON stream splitting (#1), zombie process accumulation (#2), shell injection via CLI args.
**Stack elements:** TanStack Start, better-sqlite3, sqlite-vec (extension loading), Drizzle ORM, TypeScript.

### Phase 2: Memory System (Embedding Pipeline + Search)
**Rationale:** The memory system can be built in parallel with the chat UI (Phase 3). It has its own dependency chain: embedder -> chunker -> storage -> search. Pitfalls around model loading and sqlite-vec schema must be addressed here. This is the core differentiator and needs early validation.
**Delivers:** Embedding service (node-llama-cpp + nomic-embed model), markdown chunker, sqlite-vec vector storage with two-table schema, FTS5 keyword index, hybrid search with RRF scoring.
**Addresses features:** Memory storage (markdown files), hybrid search (vector + FTS5).
**Avoids pitfalls:** Model loading blocks event loop (#3), sqlite-vec virtual table schema mismatch (#4), embedding blocks request path.
**Stack elements:** node-llama-cpp, nomic-embed-text-v1.5, sqlite-vec, FTS5, better-sqlite3.

### Phase 3: Chat UI and Session Management
**Rationale:** Depends on Phase 1 (process manager). This is where the product becomes usable. The streaming UI jank pitfall must be addressed with token batching and deferred markdown rendering. SSE connection handling must use HTTP/2.
**Delivers:** Streaming chat interface with markdown rendering, session CRUD (new/list/resume), SSE streaming endpoint, auto-scroll, loading indicators, error handling and display.
**Addresses features:** Streaming chat interface, markdown/code rendering, session management (new, list, resume), error handling, loading indicators, auto-scroll.
**Avoids pitfalls:** Streaming UI rendering jank (#5), SSE connection limits (#7).
**Stack elements:** TanStack Start (server routes for SSE, server functions for RPC), TanStack Router, TanStack Query, React 19, Tailwind CSS v4, marked + DOMPurify.

### Phase 4: MCP Integration (Memory Meets Chat)
**Rationale:** This is the convergence point where the two parallel workstreams meet. The MCP server exposes memory tools to Claude Code, and the process manager passes `--mcp-config` to wire them in. The stdout corruption pitfall is specific to this phase.
**Delivers:** MCP memory server (remember/recall/search tools), MCP config wired into process manager, Claude Code sessions that can search and write memory, end-to-end flow from user message to memory-augmented response.
**Addresses features:** MCP server with memory_search/memory_get/memory_write, memory writing by assistant.
**Avoids pitfalls:** MCP stdout corruption via console.log (#6).
**Stack elements:** @modelcontextprotocol/sdk, @anthropic-ai/claude-agent-sdk, Zod v4.

### Phase 5: Polish and Differentiators
**Rationale:** With the core loop working (chat + memory + MCP), this phase adds the features that make the product delightful and differentiated. These features layer on top of existing infrastructure without architectural changes.
**Delivers:** Tool use visibility in chat, automatic context injection from memory, memory browser UI, session title generation, memory compaction before context window fills.
**Addresses features:** Tool use visibility, automatic context injection, memory browser, memory compaction, session title generation, project/workspace context.
**Avoids pitfalls:** None new -- builds on foundations from prior phases.

### Phase Ordering Rationale

- **Phase 1 before everything:** Database and process management are foundational. Every other component reads from SQLite or depends on reliable CLI output parsing. The two highest-severity pitfalls (NDJSON splitting, zombie processes) live here.
- **Phases 2 and 3 in parallel (or interleaved):** The memory system and chat UI have independent dependency chains that only converge at Phase 4. Building them in parallel maximizes throughput. If working sequentially, Phase 2 first is recommended because it validates the core differentiator earlier.
- **Phase 4 as convergence:** MCP integration is a thin wiring layer that connects the memory service to Claude Code processes. It is small but critical -- it is when the product becomes differentiated.
- **Phase 5 last:** Polish features build on top of working infrastructure. They can be prioritized and cherry-picked based on user feedback after Phase 4 delivers the core loop.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Memory System):** The hybrid search RRF scoring, chunking strategy (size, overlap, boundaries), and embedding model performance on target hardware all need validation with real data. sqlite-vec's brute-force search performance should be benchmarked with representative data volumes.
- **Phase 4 (MCP Integration):** The Agent SDK's `createSdkMcpServer()` vs. standalone stdio MCP server tradeoff needs hands-on evaluation. The Agent SDK's streaming input mode and session resume behavior should be prototyped.

Phases with standard patterns (skip deep research):
- **Phase 1 (Foundation):** TanStack Start setup, better-sqlite3 initialization, child_process.spawn patterns are all well-documented.
- **Phase 3 (Chat UI):** SSE streaming, React rendering patterns, and session CRUD are standard patterns with extensive examples.
- **Phase 5 (Polish):** All features in this phase are incremental additions to existing infrastructure.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | All versions verified against npm registry. TanStack Start is RC (not GA) and the Agent SDK is relatively new (v0.2.x). Core libraries (better-sqlite3, sqlite-vec, node-llama-cpp) are proven. |
| Features | MEDIUM-HIGH | Feature landscape well-mapped against 4 competitor projects and OpenClaw reference. No existing wrapper has memory -- differentiator is clear. Feature prioritization is opinionated and defensible. |
| Architecture | MEDIUM-HIGH | Component boundaries, data flows, and build order are well-defined. The SSE bridge pattern and MCP sidecar pattern are documented across multiple sources. The two-table sqlite-vec schema is a firm requirement. |
| Pitfalls | HIGH | All 7 critical pitfalls sourced from multiple verified references including official docs, real-world bug reports, and community post-mortems. Recovery strategies are documented. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Agent SDK vs. CLI spawning:** STACK.md recommends the Agent SDK but ARCHITECTURE.md patterns use raw `child_process.spawn()`. The Agent SDK is newer and may not cover all edge cases. Prototype both approaches in Phase 1 and make a binding decision before Phase 3.
- **TanStack Start server routes for SSE:** Limited real-world examples of long-lived SSE connections in TanStack Start. The `createFileRoute` server handler pattern needs validation. One blog post (Jan 2026) demonstrates it but with DynamoDB, not child processes.
- **sqlite-vec performance at scale:** Brute-force search is documented as adequate for <50K vectors, but no benchmarks specific to 768-dim nomic-embed vectors on typical VM hardware. Benchmark during Phase 2.
- **Embedding model first-run download:** node-llama-cpp can download GGUF models programmatically, but the first-run experience (137MB download) needs a setup script or initialization flow.
- **nomic-embed-text-v1.5 GGUF availability:** The Q8_0 GGUF variant needs to be sourced from HuggingFace. Verify the exact file name and download URL during Phase 2 setup.
- **Schema dimension mismatch:** ARCHITECTURE.md schema example uses 384-dim (bge-small) but STACK.md recommends nomic-embed at 768-dim. The schema must use `float[768]` for vec0 virtual tables. This is a documentation inconsistency, not a technical gap -- resolve during Phase 2 schema design.

## Sources

### Primary (HIGH confidence)
- [TanStack Start Overview](https://tanstack.com/start/latest/docs/framework/react/overview) -- framework capabilities, RC status
- [TanStack Start Server Routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes) -- SSE endpoint pattern
- [TanStack Start Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) -- RPC pattern
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) -- stream-json, resume, session flags
- [Claude Code Headless Mode](https://code.claude.com/docs/en/headless) -- programmatic integration
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) -- full API
- [node-llama-cpp Embedding Guide](https://node-llama-cpp.withcat.ai/guide/embedding) -- embedding API
- [sqlite-vec JS Integration](https://alexgarcia.xyz/sqlite-vec/js.html) -- better-sqlite3 loading, vec0 tables
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) -- server implementation
- [MCP Build Server Guide](https://modelcontextprotocol.io/docs/develop/build-server) -- tool registration patterns
- [better-sqlite3 Performance](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) -- WAL mode, concurrency
- [Drizzle ORM SQLite](https://orm.drizzle.team/docs/get-started-sqlite) -- driver integration, raw SQL
- [Zod v4 Release Notes](https://zod.dev/v4) -- performance, stability
- [Claude Code Process Exhaustion Bug](https://shivankaul.com/blog/claude-code-process-exhaustion) -- zombie process real-world case
- [MCP Implementation Pitfalls](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/) -- stdout corruption, testing

### Secondary (MEDIUM confidence)
- [Hybrid Search with sqlite-vec + FTS5](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) -- RRF scoring pattern
- [OpenClaw Memory Docs](https://docs.openclaw.ai/concepts/memory) -- memory architecture reference
- [TanStack Start SSE with DynamoDB](https://johanneskonings.dev/blog/2026-01-08-tanstack-start-aws-db-multiple-entities-sse/) -- SSE pattern in TanStack Start
- [Claude Code Stream-JSON Chaining](https://github.com/ruvnet/claude-flow/wiki/Stream-Chaining) -- event types
- [Best Embedding Models 2026](https://elephas.app/blog/best-embedding-models) -- model comparison
- [Claude Code WebUI (sugyan)](https://github.com/sugyan/claude-code-webui) -- competitor feature set
- [Claude Code Web (vultuk)](https://github.com/vultuk/claude-code-web) -- competitor feature set
- [Designing for Agentic AI UX](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/) -- tool approval patterns

### Tertiary (LOW confidence)
- [Streamdown (streaming markdown)](https://tyy.ai/streamdown-ai/) -- single source, needs validation

---
*Research completed: 2026-02-12*
*Ready for roadmap: yes*
