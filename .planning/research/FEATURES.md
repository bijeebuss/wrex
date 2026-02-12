# Feature Research

**Domain:** Personal AI assistant -- web wrapper around Claude Code CLI with persistent memory
**Researched:** 2026-02-12
**Confidence:** MEDIUM-HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

#### Chat Interface

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Streaming message display | Every major AI chat product streams tokens in real-time; a "wait then dump" interface feels broken | MEDIUM | Use `--output-format stream-json --verbose --include-partial-messages` with Claude Code CLI. Parse `stream_event` objects with `delta.type == "text_delta"`. Must handle incomplete markdown gracefully during streaming. |
| Markdown rendering in messages | Claude outputs markdown by default (headers, lists, code blocks, bold/italic). Rendering plain text looks amateur. | MEDIUM | Use a streaming-aware markdown renderer. Streamdown (react-markdown fork for streaming) or similar. Must handle partial markdown blocks mid-stream without visual glitches. |
| Code syntax highlighting | Coding assistant outputs code constantly. Unhighlighted code blocks are unreadable. | LOW | Shiki or Prism.js for highlighting. Include copy-to-clipboard button on code blocks. |
| Message input with keyboard shortcuts | Enter to send, Shift+Enter for newline is universal convention in chat UIs. Users will be confused without it. | LOW | Standard textarea behavior. Consider auto-resize as input grows. |
| Loading/thinking indicators | Users need feedback that the system received their input and is working. Without it, they re-submit. | LOW | Show indicator between send and first streamed token. Claude Code can take seconds to spin up. |
| Error handling and display | CLI processes crash, network drops, tokens run out. Silent failures make the product unusable. | MEDIUM | Catch stream-json parse errors, process exit codes, timeout conditions. Display actionable error messages. Offer retry. |
| Auto-scroll with scroll-lock | Messages stream in and viewport must follow, but user should be able to scroll up without being yanked back down. | LOW | Standard pattern: auto-scroll when at bottom, pause when user scrolls up, show "scroll to bottom" button. |

#### Session Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| New session creation | Users need to start fresh conversations on new topics. | LOW | Maps to new `claude -p` invocation. Generate and store session ID from `--output-format json` response. |
| Session history sidebar | Every AI chat product (ChatGPT, Claude.ai, Gemini) has a left sidebar listing past conversations. Users expect to browse and re-open old sessions. | MEDIUM | Store session metadata (ID, title, created/updated timestamps, first message preview). Display chronologically. |
| Resume/continue session | Continuing a prior conversation is fundamental. Without it, every session starts from zero. | MEDIUM | Use `claude -p --resume <session_id>` for specific sessions. Must store and map session IDs between web UI and Claude Code CLI sessions. |
| Session title generation | Untitled sessions ("Session 1", "Session 2") are useless for navigation. Auto-generated titles from first message or topic are expected. | LOW | Derive from first user message (truncate) or ask Claude to generate a title in the background. |

#### Memory System (Core)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Memory storage as markdown files | This IS the product's core differentiator design. Markdown files as source of truth means human-readable, git-friendly, portable memory. Users can read and edit memory directly. | MEDIUM | Follow OpenClaw pattern: `MEMORY.md` for long-term curated knowledge, `memory/*.md` for daily/topical logs. Files are the ground truth; everything else is index. |
| Memory search via MCP tools | The AI must be able to search its own memory to provide context-aware responses. Without this, memory exists but is never used. | HIGH | Expose `memory_search` and `memory_get` as MCP server tools. Claude Code connects to MCP servers natively. `memory_search` does hybrid search (vector + FTS5), returns ranked snippets with file paths and line numbers. |
| Memory writing by the assistant | The AI needs to persist information to memory when asked ("remember this") or when contextually appropriate (decisions made, preferences stated). | MEDIUM | Expose `memory_write` / `memory_append` MCP tools. Let Claude write to appropriate memory files. Automatic persistence before context compaction (OpenClaw pattern). |
| Hybrid search (vector + keyword) | Vector-only search misses exact terms (error codes, names, IDs). Keyword-only search misses paraphrases. Hybrid covers both. | HIGH | sqlite-vec for vector similarity, FTS5 for BM25 keyword ranking. Merge with Reciprocal Rank Fusion (RRF). This is a well-documented pattern for SQLite specifically. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Automatic context injection from memory | Instead of requiring the user to ask "what do you remember about X?", the system automatically retrieves relevant memory based on the conversation and injects it as context. The AI just "knows" things. | HIGH | Implement as system prompt augmentation or automatic `memory_search` call at conversation start / on topic shift. OpenClaw does this by loading daily logs and MEMORY.md at session start. Consider: search on each user message and inject top results as context. Balance between relevance and token cost. |
| Memory compaction / context management | When context window fills up, intelligently summarize and persist important information before pruning. Prevents the "forgot everything mid-conversation" problem. | HIGH | Before context compaction triggers, run a silent turn asking Claude to write durable information to memory files. OpenClaw's pattern: trigger memory persistence before compaction. This is critical for long sessions. |
| Tool use visibility in UI | Show what tools Claude is using (file reads, edits, bash commands, memory operations) in a collapsible/expandable format. Users see the AI "thinking" and "doing". Builds trust and debuggability. | MEDIUM | Parse `stream-json` events for tool use. Display tool name, input, and output in collapsible UI blocks within the chat. Consider: collapsed by default with expand on click. Claude Code's stream-json emits tool use events. |
| File diff display for code changes | When Claude edits files, show the diff (before/after) inline in the chat. Users can review what changed without switching to a terminal. | HIGH | Parse Edit tool results from stream-json output. Render unified or side-by-side diff view. This is what makes IDE integrations feel magical. Library options: react-diff-viewer or similar. |
| Memory browser / knowledge base UI | Let users browse, read, edit, and organize their memory files through the web interface. Makes the memory system tangible and trustworthy. | MEDIUM | File tree view of `memory/` directory. Markdown viewer/editor for individual files. Show file metadata (created, modified, size). This reinforces the "markdown files as source of truth" design. |
| Session-to-memory extraction | After a session ends (or during), automatically extract key decisions, facts, and action items into memory files. Users don't have to say "remember this" for everything. | HIGH | Post-session processing: ask Claude to review the session transcript and extract durable information. Write to appropriate memory files (daily log, or topical files). This is the "memory just works" experience. |
| Project/workspace context | Associate sessions with specific project directories. Claude Code operates in a project context, and the UI should reflect which project is active and allow switching. | MEDIUM | Directory picker or project list. Pass `--cwd` to Claude Code CLI. Store project associations with sessions. Memory can be project-scoped (e.g., `projects/wrex/memory/`). |
| Smart session suggestions | Show relevant past sessions when starting a new conversation. "You discussed this topic 3 days ago -- continue that session?" Reduces orphaned duplicate sessions. | MEDIUM | Search session history (titles + first messages) against new user input. Surface matches. Requires session metadata indexing. |
| Configurable tool permissions | Let users set which tools Claude can auto-approve vs. which require confirmation. Balance between speed (auto-approve reads) and safety (confirm bash commands). | MEDIUM | Map to Claude Code's `--allowedTools` flag. Persist per-project permission profiles. UI toggle for permission levels (strict / balanced / permissive). Follows the "autonomy dial" UX pattern from agentic AI design. |
| Keyboard shortcuts and power-user UX | Cmd+K for new session, Cmd+/ for search, Cmd+Shift+M for memory browser. Power users (the target audience for a CLI wrapper) expect keyboard-driven interaction. | LOW | Standard hotkey patterns. Document them. This audience lives in terminals and expects keyboard control. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Explicitly NOT building these.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Multi-user / authentication system | "What if someone else uses my VM?" | Wrex is a single-user personal assistant on a dedicated VM. Auth adds complexity (sessions, tokens, middleware, password reset) for a use case that doesn't exist. Network-level access control (VPN, SSH tunnel, firewall rules) is simpler and more secure. | Bind to localhost or use network-level access control. If remote access is needed, SSH tunnel or Tailscale. |
| Multi-model support (GPT-4, Gemini, etc.) | "What if I want to use a different model?" | Wrex wraps Claude Code CLI specifically. Multi-model means different CLIs, different streaming formats, different tool calling patterns, different session management. It fractures every integration point. | Build for Claude Code exclusively. If model switching is needed in the future, it's a v3 concern at earliest. The value is the Claude Code integration, not model-agnostic chat. |
| Voice input/output | "All the cool assistants have voice." | Voice adds STT/TTS dependencies, audio processing, latency, and an entirely different UX paradigm. The target user is a developer who types. Voice is a distraction from the core text+code workflow. | Not building. If ever needed, browser's built-in speech-to-text API is a LOW-effort future addition. |
| Plugin / extension system | "Let users add their own integrations." | Premature abstraction. Plugin APIs are expensive to design, maintain, and support. They calcify internal interfaces before the product has stabilized. MCP is already the extension mechanism for Claude's capabilities. | Leverage MCP for tool extensibility. The MCP server IS the extension point. Adding new MCP tools is the plugin system. |
| Real-time collaboration | "What if two people want to chat with the same assistant?" | Single user product. Collaboration features (presence, conflict resolution, shared state) are enormously complex. YAGNI. | Not applicable for single-user product. |
| RAG over arbitrary documents (PDF upload, etc.) | "Let me upload my docs and chat with them." | This is a different product. Building a general-purpose RAG pipeline (document parsing, chunking, embedding, retrieval) is a massive undertaking. The memory system serves a different purpose: persistent personal knowledge, not ad-hoc document Q&A. | Memory system handles curated knowledge. For one-off document questions, paste content into chat or use Claude Code's native file reading. |
| Mobile-native app | "Build an iOS/Android app." | Web interface works on mobile browsers already with responsive design. Native app means App Store review, separate codebase, push notifications infra, update distribution. Zero benefit for a self-hosted VM tool. | Responsive web design. PWA (add to homescreen) if needed. |
| Conversation branching / tree view | "Let me fork a conversation at any point." | Adds massive UI and state complexity (branch navigation, merge conflicts, session tree storage). Marginal value when you can just start a new session with context. | Start a new session. Reference previous session content via memory. |
| Automated scheduled tasks | "Run this prompt every morning at 9am." | Cron + Claude Code CLI already handles this. Building a scheduler UI is scope creep that duplicates system-level tools the target user already knows (cron, systemd timers). | Document how to use cron with `claude -p`. |
| Token usage tracking / cost dashboard | "Show me how many tokens I'm using." | Premature optimization. Single user on a personal VM with a Claude subscription. Token tracking adds logging, storage, visualization complexity. Not a pain point until it's a pain point. | Log raw API metadata to files if curious. Build dashboard only if cost becomes a real concern. |

## Feature Dependencies

```
[Markdown Rendering]
    └──requires──> [Streaming Display] (must render partial markdown mid-stream)

[Session Resume]
    └──requires──> [Session History Sidebar] (need to select which session)
    └──requires──> [New Session Creation] (need session IDs to resume)

[Memory Search (MCP)]
    └──requires──> [Memory Storage (markdown files)]
    └──requires──> [Hybrid Search Index (sqlite-vec + FTS5)]
    └──requires──> [MCP Server Implementation]

[Memory Write (MCP)]
    └──requires──> [Memory Storage (markdown files)]
    └──requires──> [MCP Server Implementation]

[Automatic Context Injection]
    └──requires──> [Memory Search (MCP)]
    └──enhances──> [Session Resume] (inject memory when resuming old session)

[Memory Compaction]
    └──requires──> [Memory Write (MCP)]
    └──requires──> [Context Window Monitoring]

[Tool Use Visibility]
    └──requires──> [Streaming Display] (tool events come through stream-json)

[File Diff Display]
    └──requires──> [Tool Use Visibility] (diffs are a type of tool result)
    └──enhances──> [Tool Use Visibility]

[Memory Browser UI]
    └──requires──> [Memory Storage (markdown files)]
    └──enhances──> [Memory Search (MCP)] (human curation improves search quality)

[Session-to-Memory Extraction]
    └──requires──> [Memory Write (MCP)]
    └──requires──> [Session History] (need session transcript to extract from)

[Smart Session Suggestions]
    └──requires──> [Session History Sidebar]
    └──enhances──> [Memory Search (MCP)] (uses same search infrastructure)

[Project/Workspace Context]
    └──enhances──> [New Session Creation] (sessions scoped to project)
    └──enhances──> [Memory Storage] (memory scoped to project)
```

### Dependency Notes

- **Streaming Display is foundational:** Nearly everything in the chat interface depends on properly parsing and rendering Claude Code's `stream-json` output. Build this first, build it well.
- **MCP Server is the memory gateway:** All memory features (search, write, auto-inject, compaction) flow through the MCP server. This is the second critical foundation after the chat interface.
- **Memory indexing (sqlite-vec + FTS5) gates memory usefulness:** Without the search index, memory files exist but the AI cannot efficiently find relevant information. This is what makes memory actually work vs. being a pile of unstructured files.
- **Tool visibility enhances trust but isn't required for function:** The chat works without showing tool use, but showing it builds user confidence and aids debugging.
- **File diff display requires tool visibility:** Diffs are a specialized rendering of Edit tool results, so the generic tool display pipeline must exist first.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what's needed to validate the concept.

- [ ] **Streaming chat interface** -- Core interaction model. Must render Claude Code's stream-json output as a real-time chat with markdown rendering and code highlighting. Without this there is no product.
- [ ] **Basic session management** -- New session, session list sidebar, resume session. Maps to `claude -p`, `--resume`, session ID tracking. Without this every page refresh loses context.
- [ ] **Memory storage (markdown files)** -- Create the file structure and conventions for memory storage. Even before search works, the AI can read/write files if given paths.
- [ ] **MCP server with memory_search and memory_get** -- The core memory retrieval tools. Hybrid search (vector + keyword) over markdown files. This is what makes the assistant "remember".
- [ ] **MCP memory_write / memory_append** -- Let the AI persist information. Without write capability, memory must be manually curated.
- [ ] **Error handling and recovery** -- Graceful handling of CLI crashes, stream interruptions, and edge cases. Usability depends on reliability.

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Tool use visibility** -- Once streaming works reliably, add collapsible tool use display. Trigger: users asking "what is it doing?" during long operations.
- [ ] **Automatic context injection** -- Search memory on each conversation and inject relevant context. Trigger: users finding themselves repeatedly re-explaining things the AI should know.
- [ ] **Memory browser UI** -- File tree + markdown viewer for memory files. Trigger: users wanting to see and curate what the assistant remembers.
- [ ] **Memory compaction** -- Persist important information before context window fills. Trigger: long sessions losing context.
- [ ] **Project/workspace context** -- Scope sessions and memory to project directories. Trigger: using the assistant for multiple distinct projects.
- [ ] **Configurable tool permissions** -- Per-project permission profiles. Trigger: users wanting faster auto-approval for trusted operations.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **File diff display** -- Inline diff rendering for code changes. Defer because: requires robust tool visibility pipeline first, and users can check diffs in their editor/git.
- [ ] **Session-to-memory extraction** -- Automatic post-session knowledge extraction. Defer because: needs reliable memory write + good heuristics for what's worth extracting.
- [ ] **Smart session suggestions** -- Surface related past sessions. Defer because: needs substantial session history to be useful.
- [ ] **Keyboard shortcuts** -- Power-user hotkeys. Defer because: low effort but not needed until daily-driver usage is established.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Streaming chat interface | HIGH | MEDIUM | P1 |
| Markdown + code rendering | HIGH | MEDIUM | P1 |
| New session creation | HIGH | LOW | P1 |
| Session history sidebar | HIGH | MEDIUM | P1 |
| Session resume | HIGH | MEDIUM | P1 |
| Error handling + recovery | HIGH | MEDIUM | P1 |
| Memory file storage | HIGH | LOW | P1 |
| MCP server (memory_search, memory_get) | HIGH | HIGH | P1 |
| MCP memory_write | HIGH | MEDIUM | P1 |
| Hybrid search (vector + FTS5) | HIGH | HIGH | P1 |
| Loading/thinking indicators | MEDIUM | LOW | P1 |
| Auto-scroll with scroll-lock | MEDIUM | LOW | P1 |
| Session title generation | MEDIUM | LOW | P2 |
| Tool use visibility | HIGH | MEDIUM | P2 |
| Automatic context injection | HIGH | HIGH | P2 |
| Memory browser UI | MEDIUM | MEDIUM | P2 |
| Memory compaction | HIGH | HIGH | P2 |
| Project/workspace context | MEDIUM | MEDIUM | P2 |
| Configurable tool permissions | MEDIUM | MEDIUM | P2 |
| File diff display | MEDIUM | HIGH | P3 |
| Session-to-memory extraction | MEDIUM | HIGH | P3 |
| Smart session suggestions | LOW | MEDIUM | P3 |
| Keyboard shortcuts | MEDIUM | LOW | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Claude Code WebUI (sugyan) | Claude Code Web (vultuk) | CloudCLI (siteboon) | OpenClaw | Wrex (our approach) |
|---------|---------------------------|-------------------------|---------------------|----------|---------------------|
| Streaming chat | Yes | Yes (terminal-based) | Yes | Yes | Yes -- stream-json parsing to rich markdown |
| Session management | History browsing, restore | Multi-session, persistence, multi-browser | Project discovery, history, resume | Session transcripts, context management | Session sidebar, resume via CLI session IDs |
| Memory / knowledge | None | None | None | Markdown files + hybrid search + MCP tools | Markdown files + sqlite-vec + FTS5 + MCP tools |
| Tool use visibility | Permission controls shown | Terminal output | Built-in shell terminal | Agent tool display | Collapsible tool use blocks in chat |
| File operations | Via Claude, with permissions | Full terminal access | File explorer + code editor | Via agent tools | Via Claude Code tools, shown in chat |
| Mobile support | Responsive design | Responsive | PWA, touch-optimized | Web-based | Responsive web (not a priority) |
| Git integration | None visible | None | Built-in git explorer | Via tools | Via Claude Code's native git tools |
| Project management | Directory picker | Folder browsing | Auto-discovery, grouping | Workspace-based | Project directory association |
| Auth / multi-user | None | Token-based auth | None mentioned | Per-agent config | None (single-user, network access control) |
| Diff viewer | No | No (terminal only) | CodeMirror editor | No | Future: inline diff display |
| Memory differentiator | -- | -- | -- | Markdown source of truth, semantic + BM25 hybrid search, auto-compaction | Markdown source of truth, sqlite-vec + FTS5 hybrid RRF, MCP tools, memory browser |

### Key Competitive Insight

None of the existing Claude Code web wrappers have a memory system. They are all "chat interface + session management" without persistent knowledge. OpenClaw has memory but is a full autonomous agent framework, not a lightweight CLI wrapper. Wrex's differentiator is combining the simplicity of a Claude Code web wrapper with OpenClaw-grade memory capabilities.

## Sources

- [Claude Code Headless Mode docs](https://code.claude.com/docs/en/headless) -- Official documentation for CLI/headless integration (HIGH confidence)
- [OpenClaw Memory docs](https://docs.openclaw.ai/concepts/memory) -- Memory system architecture reference (HIGH confidence)
- [Claude Code WebUI (sugyan)](https://github.com/sugyan/claude-code-webui) -- Competitor feature set (MEDIUM confidence)
- [Claude Code Web (vultuk)](https://github.com/vultuk/claude-code-web) -- Competitor feature set (MEDIUM confidence)
- [CloudCLI / Claude Code UI (siteboon)](https://github.com/siteboon/claudecodeui) -- Competitor feature set (MEDIUM confidence)
- [sqlite-vec hybrid search blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) -- Hybrid search implementation patterns (HIGH confidence)
- [Mem0 memory layer](https://github.com/mem0ai/mem0) -- Memory system patterns and benchmarks (MEDIUM confidence)
- [Smashing Magazine: Designing for Agentic AI](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/) -- Tool approval UX patterns (MEDIUM confidence)
- [Assistant UI library](https://github.com/assistant-ui/assistant-ui) -- AI chat interface component patterns (MEDIUM confidence)
- [Streamdown](https://tyy.ai/streamdown-ai/) -- Streaming markdown rendering (LOW confidence -- single source)

---
*Feature research for: AI assistant web wrapper with persistent memory*
*Researched: 2026-02-12*
