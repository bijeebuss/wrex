# Requirements: Wrex

**Defined:** 2026-02-12
**Core Value:** A conversational AI assistant with persistent, searchable memory -- so every session builds on everything that came before.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Chat Interface

- [ ] **CHAT-01**: User can type a message and send it to Claude Code (Enter to send, Shift+Enter for newline)
- [ ] **CHAT-02**: User sees Claude's response streamed token-by-token in real-time
- [ ] **CHAT-03**: Messages render markdown with syntax-highlighted code blocks and copy button
- [ ] **CHAT-04**: User sees a loading/thinking indicator between sending a message and first response token
- [ ] **CHAT-05**: User sees actionable error messages when something fails, with option to retry
- [ ] **CHAT-06**: Chat auto-scrolls during streaming but stops when user scrolls up, with "scroll to bottom" button
- [ ] **CHAT-07**: User can see what tools Claude is using in collapsible blocks within the chat

### Session Management

- [ ] **SESS-01**: User can start a new chat session with one click
- [ ] **SESS-02**: User can browse past sessions in a sidebar sorted by recency
- [ ] **SESS-03**: User can click a past session to resume the conversation
- [ ] **SESS-04**: Sessions get auto-generated titles from the first message or AI-generated summary

### Memory System

- [ ] **MEM-01**: Agent stores knowledge in markdown files (MEMORY.md + memory/*.md) as source of truth
- [ ] **MEM-02**: Memory files are chunked, embedded locally (node-llama-cpp), and indexed in SQLite with sqlite-vec
- [ ] **MEM-03**: Memory supports hybrid search combining vector similarity and FTS5 keyword search
- [ ] **MEM-04**: MCP server exposes memory_search tool that returns ranked snippets with file paths and scores
- [ ] **MEM-05**: MCP server exposes memory_get tool that reads specific memory file content by path and line range
- [ ] **MEM-06**: MCP server exposes memory_write tool that lets Claude persist information to memory files
- [ ] **MEM-07**: Relevant memory is automatically searched and injected as context for each conversation

### Infrastructure

- [ ] **INFR-01**: TypeScript web server built with TanStack Start serves the application
- [ ] **INFR-02**: Server spawns Claude Code CLI in headless mode with streaming JSON output
- [ ] **INFR-03**: Server forwards streaming events to the browser in real-time (SSE)
- [ ] **INFR-04**: All session data stored in SQLite database
- [ ] **INFR-05**: Claude Code runs with --dangerously-skip-permissions flag

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Memory Enhancements

- **MEM-08**: Memory compaction -- persist important information before context window fills
- **MEM-09**: Session-to-memory extraction -- automatically extract key decisions/facts after sessions
- **MEM-10**: Memory browser UI -- browse, read, edit, and organize memory files in the web interface

### Chat Enhancements

- **CHAT-08**: File diff display -- show before/after diffs inline when Claude edits files
- **CHAT-09**: Keyboard shortcuts -- Cmd+K for new session, Cmd+/ for search

### Project Management

- **PROJ-01**: Project/workspace context -- associate sessions with specific project directories
- **PROJ-02**: Configurable tool permissions -- per-project permission profiles

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-provider support | Claude only, via Claude Code CLI -- architecture decision |
| Multi-user / authentication | Single user on dedicated VM -- use network-level access control |
| Docker/containerization | Runs directly on VM |
| Channel integrations (Slack, Discord) | Web UI only |
| Voice input/output | Target user is a developer who types |
| Plugin/extension system | MCP is the extension mechanism |
| Mobile native app | Responsive web is sufficient |
| RAG over arbitrary documents | Memory system is for persistent knowledge, not ad-hoc document Q&A |
| Conversation branching | Start a new session instead |
| Automated scheduled tasks | Use cron + claude -p directly |
| Real-time collaboration | Single user product |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAT-01 | Phase 3 | Pending |
| CHAT-02 | Phase 3 | Pending |
| CHAT-03 | Phase 3 | Pending |
| CHAT-04 | Phase 3 | Pending |
| CHAT-05 | Phase 3 | Pending |
| CHAT-06 | Phase 3 | Pending |
| CHAT-07 | Phase 3 | Pending |
| SESS-01 | Phase 3 | Pending |
| SESS-02 | Phase 3 | Pending |
| SESS-03 | Phase 3 | Pending |
| SESS-04 | Phase 3 | Pending |
| MEM-01 | Phase 2 | Pending |
| MEM-02 | Phase 2 | Pending |
| MEM-03 | Phase 2 | Pending |
| MEM-04 | Phase 2 | Pending |
| MEM-05 | Phase 2 | Pending |
| MEM-06 | Phase 2 | Pending |
| MEM-07 | Phase 3 | Pending |
| INFR-01 | Phase 1 | Pending |
| INFR-02 | Phase 1 | Pending |
| INFR-03 | Phase 1 | Pending |
| INFR-04 | Phase 1 | Pending |
| INFR-05 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-02-12*
*Last updated: 2026-02-12 after roadmap creation*
