# Roadmap: Wrex

## Overview

Wrex delivers a web-based conversational AI assistant with persistent memory in three phases. Phase 1 lays the server foundation and Claude Code CLI integration. Phase 2 builds the memory pipeline -- embedding, hybrid search, and MCP tool exposure -- which is the core differentiator. Phase 3 brings it all together in a streaming chat interface with session management and automatic memory injection, making the product usable end-to-end.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation and CLI Integration** - Server skeleton, database, and Claude Code process manager
- [x] **Phase 2: Memory Pipeline** - Embedding, hybrid search, and MCP memory tools
- [ ] **Phase 3: Chat Experience** - Streaming UI, session management, and memory-augmented conversations

## Phase Details

### Phase 1: Foundation and CLI Integration
**Goal**: A running TanStack Start server that can spawn Claude Code CLI processes, parse their streaming output reliably, and store data in SQLite
**Depends on**: Nothing (first phase)
**Requirements**: INFR-01, INFR-02, INFR-03, INFR-04, INFR-05
**Success Criteria** (what must be TRUE):
  1. TanStack Start dev server starts and serves a page in the browser
  2. Server can spawn a Claude Code CLI process with a prompt and receive streaming JSON events back without dropping or corrupting events
  3. SQLite database is created with session schema and sqlite-vec extension loaded successfully
  4. Server forwards Claude Code streaming events to the browser via SSE in real-time
  5. Claude Code processes are tracked and cleaned up on disconnect -- no zombie processes accumulate
**Plans**: 2 plans

Plans:
- [x] 01-01: TanStack Start skeleton with SQLite database setup (Drizzle ORM, sqlite-vec, FTS5, session schema)
- [x] 01-02: Claude Code process manager with NDJSON stream parsing and SSE bridge to browser

### Phase 2: Memory Pipeline
**Goal**: A complete memory system where markdown files are chunked, embedded locally, indexed for hybrid search, and exposed as MCP tools that Claude Code can call
**Depends on**: Phase 1 (SQLite database, server infrastructure)
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04, MEM-05, MEM-06
**Success Criteria** (what must be TRUE):
  1. Markdown memory files are chunked and embedded using node-llama-cpp, with vectors stored in sqlite-vec and text indexed in FTS5
  2. Hybrid search (vector similarity + keyword) returns ranked, relevant snippets given a natural language query
  3. MCP server exposes memory_search, memory_get, and memory_write tools over stdio and Claude Code can call them during a session
  4. Claude Code can persist new information to markdown memory files via the memory_write tool, and the new content becomes searchable after indexing
**Plans**: 3 plans

Plans:
- [x] 02-01: Embedding service (node-llama-cpp + nomic-embed model) and markdown chunker
- [x] 02-02: SQLite vector storage (sqlite-vec) and FTS5 indexing with hybrid search (RRF scoring)
- [x] 02-03: MCP memory server exposing memory_search, memory_get, and memory_write tools

### Phase 3: Chat Experience
**Goal**: Users can have streaming conversations with Claude through the browser, manage sessions, see tool usage, and benefit from automatic memory context -- the full end-to-end product
**Depends on**: Phase 1 (process manager, SSE), Phase 2 (MCP memory server)
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07, SESS-01, SESS-02, SESS-03, SESS-04, MEM-07
**Success Criteria** (what must be TRUE):
  1. User can type a message, send it, and see Claude's response stream token-by-token with proper markdown rendering and syntax-highlighted code blocks
  2. User can start a new session, browse past sessions in a sidebar, and click one to resume the conversation where it left off
  3. User sees loading indicators while waiting for Claude, actionable error messages on failure, and auto-scrolling that respects manual scroll position
  4. User can see what tools Claude is using (including memory tools) in collapsible blocks within the conversation
  5. Relevant memory is automatically searched and injected as context for each conversation, so Claude's responses build on prior knowledge
**Plans**: 3 plans

Plans:
- [ ] 03-01: Streaming chat interface (message input, token-by-token display, markdown rendering, loading states, error handling, auto-scroll)
- [ ] 03-02: Session management (new session, sidebar with history, resume conversation, auto-generated titles)
- [ ] 03-03: Memory integration and tool visibility (MCP config wiring, automatic context injection, collapsible tool-use blocks)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and CLI Integration | 2/2 | Complete | 2026-02-12 |
| 2. Memory Pipeline | 3/3 | Complete | 2026-02-12 |
| 3. Chat Experience | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-12*
