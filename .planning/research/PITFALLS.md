# Pitfalls Research

**Domain:** AI assistant CLI wrapper with streaming, memory system, and chat UI
**Researched:** 2026-02-12
**Confidence:** HIGH (multiple sources verified across domains)

## Critical Pitfalls

### Pitfall 1: NDJSON Stream Splitting at Chunk Boundaries

**What goes wrong:**
Node.js `child_process.spawn()` delivers stdout data in arbitrary chunks. A single NDJSON line from Claude Code's `--output-format stream-json` output frequently arrives split across two or more `data` events. Naively calling `JSON.parse()` on each chunk produces `SyntaxError` exceptions and drops events. This is the single most common bug in CLI-wrapper projects.

**Why it happens:**
Node.js streams deliver data based on OS pipe buffer sizes (typically 64KB on Linux), not based on newline delimiters. A single Claude Code event like a `content_block_delta` is one JSON object per line, but the pipe has no knowledge of line boundaries. Under high throughput (fast token streaming), multiple lines can arrive in one chunk, or one line can be split across chunks.

**How to avoid:**
Implement a line-buffering transform between the raw stdout stream and your JSON parser. Accumulate incoming data in a string buffer, split on `\n`, and only parse complete lines. Hold the final partial segment until the next chunk arrives. Use the `split2` npm package or write a custom `Transform` stream:

```typescript
let buffer = '';
childProcess.stdout.on('data', (chunk: Buffer) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? ''; // Keep incomplete trailing line
  for (const line of lines) {
    if (line.trim()) {
      try {
        const event = JSON.parse(line);
        emitter.emit('event', event);
      } catch (e) {
        // Log but don't crash - malformed lines happen during process shutdown
      }
    }
  }
});
```

**Warning signs:**
- Intermittent `SyntaxError: Unexpected end of JSON input` in logs
- Missing events during fast streaming (tokens appear to skip)
- Works fine for short responses but breaks on long ones
- Tests pass with small fixtures but fail with real Claude Code output

**Phase to address:**
Phase 1 (CLI process wrapper). This must be correct from day one because every downstream feature depends on reliable event parsing.

---

### Pitfall 2: Claude Code Child Process Zombie Accumulation

**What goes wrong:**
Claude Code processes that are not properly terminated become zombies or orphans. Claude Code itself has had a documented bug where it spawned thousands of `pgrep` processes, exhausting the per-user process limit and locking up the system. When wrapping Claude Code in a web server that manages multiple sessions, each leaked process compounds. After hours of use, the system becomes unresponsive.

**Why it happens:**
Several failure modes converge:
1. The parent Node.js process crashes or restarts without sending SIGTERM to children
2. Claude Code sessions hang (waiting for input, network timeout) and never exit
3. `child.kill()` sends SIGTERM but Claude Code spawns its own child processes (sub-agents, MCP servers) that are not in the same process group, so they survive
4. Using `spawn()` without `detached: false` or without proper process group management

**How to avoid:**
- Spawn with `{ detached: false }` (the default) so children are in the parent's process group
- Track all spawned PIDs in a `Map<sessionId, ChildProcess>`
- On parent `process.on('exit')`, `process.on('SIGINT')`, `process.on('SIGTERM')`: iterate and kill all tracked children
- Implement a watchdog that checks child process liveness every 30 seconds: if a child's stdin is closed but the process still exists, force-kill it
- Set `--max-turns` on Claude Code invocations to prevent infinite agentic loops
- Use `ulimit -u` or cgroup limits as a safety net (as the Claude Code process wrapper fix demonstrated)

**Warning signs:**
- System `ps aux | grep claude` shows many processes after sessions should have ended
- Server memory usage grows continuously over time
- New sessions fail to start (process limit reached)
- System becomes sluggish after extended uptime

**Phase to address:**
Phase 1 (CLI process wrapper). Zombie prevention is a foundational concern for the process manager. Add a health-check endpoint that reports active/zombie process counts.

---

### Pitfall 3: node-llama-cpp Model Loading Blocks the Event Loop

**What goes wrong:**
Loading a GGUF embedding model with node-llama-cpp is a synchronous, CPU-intensive operation that can take 2-10 seconds depending on model size. If the model is loaded during a request handler or on the server's main thread, the entire Node.js event loop freezes. No HTTP requests are served, no WebSocket messages are processed, and streaming connections stall.

**Why it happens:**
node-llama-cpp uses native C++ bindings (N-API). Model loading involves reading the entire GGUF file into memory, allocating GPU/CPU buffers, and initializing the compute graph. This happens on the calling thread. Developers often load the model lazily on first embedding request rather than eagerly at startup.

**How to avoid:**
- Load the model eagerly at server startup, before accepting any HTTP connections
- Use `await llama.loadModel()` during an initialization phase, not inside request handlers
- If hot-reloading models is needed, do it in a worker thread
- Set `contextSize` explicitly rather than using `"auto"` to avoid unpredictable memory estimation delays
- For embedding models specifically (nomic-embed-text, all-MiniLM), use small quantized GGUF variants (Q4_K_M or Q8_0 are sufficient for embeddings). The F16 nomic-embed-text-v1.5 GGUF is ~274MB; a Q8_0 variant is ~137MB. MiniLM-L6-v2 is ~23MB
- Keep the model instance as a long-lived singleton; do not load/unload per request

**Warning signs:**
- First embedding request after server start takes abnormally long (seconds)
- Other endpoints become unresponsive during embedding operations
- `InsufficientMemoryError` on machines with limited RAM/VRAM
- ESM import errors if project uses CommonJS (node-llama-cpp is ESM-only)

**Phase to address:**
Phase 2 (Memory/embeddings system). Model loading strategy must be decided when designing the embedding pipeline. Validate memory requirements on target hardware early.

---

### Pitfall 4: sqlite-vec Virtual Table Impedance Mismatch

**What goes wrong:**
sqlite-vec uses virtual tables (like FTS5), which means vectors live in separate tables from your main data. Developers design their schema with vectors in the same table as metadata, discover this is impossible, and have to restructure. Additionally, sqlite-vec is currently brute-force only (no ANN indexes), so query times degrade linearly with dataset size. At 100K+ vectors with 768+ dimensions, searches take seconds rather than milliseconds.

**Why it happens:**
sqlite-vec's virtual table approach is a fundamental architectural constraint of SQLite extensions. Developers familiar with pgvector or Pinecone expect to `ALTER TABLE memories ADD COLUMN embedding VECTOR(768)` and are surprised when the vector search requires a separate virtual table with JOIN queries. Additionally, planned features like metadata filtering before vector search are not yet implemented, forcing full-table scans followed by application-level filtering.

**How to avoid:**
- Design the schema from the start with two tables: `memories` (id, content, metadata, timestamps) and `vec_memories` (rowid matching memories.id, embedding)
- Use a repository/service layer that abstracts the two-table pattern
- Keep vectors in low dimensions (384 for MiniLM, 768 for nomic-embed) and use quantization (int8 reduces memory 4x)
- For a personal assistant with <50K memories, brute-force is actually fine (benchmarks show ~50ms for 50K 768-dim float vectors)
- Plan for future migration to ANN indexing when sqlite-vec adds it, by keeping the vector search behind an interface
- Enable WAL mode immediately: `PRAGMA journal_mode=WAL` for concurrent read/write access

**Warning signs:**
- Schema design has vector columns in regular tables
- No JOIN between metadata and vector tables in queries
- Search latency increases noticeably as memory count grows
- WAL file grows without bound (checkpoint starvation from long-lived read transactions)

**Phase to address:**
Phase 2 (Memory/embeddings system). Schema design must account for the two-table pattern from the beginning. Performance testing with representative data volumes should happen during this phase.

---

### Pitfall 5: Streaming UI Renders 10-50x Per Second Causing Jank

**What goes wrong:**
Claude Code's `stream-json` output emits a `content_block_delta` event for each token (word or sub-word). During fast generation, this means 10-50 React state updates per second. Each `setState` triggers a re-render. If the message component does markdown parsing, syntax highlighting, or DOM measurement on every render, the UI becomes janky: frames drop, scrolling stutters, and the browser becomes unresponsive.

**Why it happens:**
The natural architecture is: receive SSE event -> update message state -> re-render. React re-renders the entire message component subtree on each state update. Markdown-to-HTML conversion (via remark/rehype or similar) and syntax highlighting (via Prism/Shiki) are expensive operations that should not run 50 times per second.

**How to avoid:**
- During active streaming, render the accumulating text as plain text (or with minimal formatting). Only apply full markdown rendering and syntax highlighting after the stream completes
- Use `React.memo()` on individual message components to prevent parent re-renders from cascading
- Batch token updates: accumulate tokens for 50-100ms before updating state (requestAnimationFrame-based batching)
- Detect incomplete code blocks (odd number of triple-backtick markers) and skip syntax highlighting until the block is complete
- Use `useRef` for the accumulating text buffer and only update display state on a throttled interval
- TanStack Start supports streaming via `ReadableStream` from `createServerFn` and async generators -- use these for typed streaming rather than raw SSE

**Warning signs:**
- Visible frame drops during fast token streaming
- Browser DevTools Performance tab shows long tasks (>50ms) on every token
- Scroll-to-bottom auto-scroll becomes jerky
- CPU usage spikes to 100% during streaming on the client

**Phase to address:**
Phase 3 (Chat UI). This must be solved when building the streaming message display. A prototype with real Claude Code output should be tested for jank before committing to the rendering architecture.

---

### Pitfall 6: MCP Server stdout Corruption via console.log

**What goes wrong:**
When implementing an MCP server using stdio transport, any `console.log()` call writes to stdout, corrupting the JSON-RPC message stream. The MCP client (Claude Code) receives invalid protocol messages and disconnects or errors. The server appears to "randomly" fail. Debugging is especially confusing because adding more logging makes it worse.

**Why it happens:**
In MCP's stdio transport, stdout is exclusively reserved for JSON-RPC protocol messages. Node.js's `console.log()` writes to stdout by default. Developers add debug logging without realizing it corrupts the transport. Third-party libraries that log to stdout (common in npm packages) also cause corruption. This is explicitly documented as the number-one mistake in MCP implementation guides.

**How to avoid:**
- Never use `console.log()` in MCP server code; use `console.error()` (writes to stderr) for all logging
- Configure any logging library (winston, pino) to write to stderr or files, never stdout
- Audit all dependencies for stdout writes: any `process.stdout.write()` call is a corruption risk
- Use a linter rule or wrapper that redirects `console.log` to stderr in MCP server contexts
- Consider using Streamable HTTP transport instead of stdio if the MCP server runs as a standalone process (Anthropic has deprecated SSE transport in favor of Streamable HTTP)
- Test the MCP server with the MCP Inspector tool before integrating with Claude Code

**Warning signs:**
- MCP server works in isolation but fails when connected to Claude Code
- Intermittent "parse error" or "invalid JSON" in Claude Code's MCP logs
- Adding debug logging makes the problem worse (paradoxical)
- Server works initially but fails after the first tool call response

**Phase to address:**
Phase 4 (MCP integration) or whenever MCP server development begins. Establish the "no stdout" rule as a project convention from the start. Use eslint-plugin-no-console with stdout-specific configuration.

---

### Pitfall 7: SSE Connection Limits and Proxy Buffering

**What goes wrong:**
When using Server-Sent Events (SSE) over HTTP/1.1, browsers limit connections to 6 per domain. With multiple concurrent chat sessions open in different tabs, the connection limit is quickly exhausted. New sessions cannot establish SSE connections and appear to hang. Additionally, reverse proxies (nginx, Cloudflare) buffer responses by default, which delays or destroys the streaming effect -- tokens arrive in batches rather than individually.

**Why it happens:**
HTTP/1.1 has a per-domain connection limit of 6 in most browsers. Each SSE connection holds one open. If you have a chat session + other API calls, the budget is tight. Proxies buffer responses for efficiency, not knowing that SSE responses must be flushed immediately.

**How to avoid:**
- Use HTTP/2 (raises the limit to 100+ concurrent streams on a single connection) -- TanStack Start with Vinxi/Nitro supports this
- If HTTP/1.1 is unavoidable, use a single SSE connection multiplexed across sessions (route session events through a shared connection with session IDs in the event data)
- Set response headers to prevent buffering: `X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`
- Send heartbeat comments (`:heartbeat\n\n`) every 15 seconds to keep connections alive through proxies and load balancers
- For a single-user app, this is less critical, but still matters if the user opens multiple tabs

**Warning signs:**
- Streaming works for the first few sessions but new tabs hang
- Tokens arrive in bursts rather than individually (proxy buffering)
- SSE connections drop after ~60 seconds of no data (missing heartbeats)
- Works in dev but breaks in production behind nginx

**Phase to address:**
Phase 3 (Chat UI / streaming transport). Choose HTTP/2 from the start. Configure the server framework to disable response buffering for SSE routes.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Embedding on every insert synchronously | Simple implementation | Blocks the insert path; UI hangs while embedding computes | Never for user-facing operations. Always queue embedding work asynchronously |
| Storing raw Claude Code JSON events without normalization | Fast to implement, preserves all data | Event schema changes between Claude Code versions break your queries; bloated storage | Only during prototyping. Normalize to your own schema before Phase 2 is complete |
| Single SQLite database for chat history AND vector search | Simpler deployment, one file | WAL checkpoint starvation when long vector queries overlap with chat writes; schema coupling | Acceptable for MVP if WAL mode is enabled. Split databases if performance degrades |
| Skipping the `--max-turns` flag on Claude Code | Lets Claude work autonomously | Runaway sessions that burn API credits and never terminate, consuming server resources | Never in production. Always set a reasonable limit (10-20 turns) |
| Loading embedding model on first request | Faster server startup | First user request takes 2-10 seconds; race conditions if concurrent requests trigger multiple loads | Only during development. Eager-load at startup in production |
| Using `child_process.exec()` instead of `spawn()` | Simpler API, returns string directly | 200KB buffer limit on stdout; crashes on long Claude Code responses; no streaming capability | Never for Claude Code wrapper. Always use `spawn()` |

## Integration Gotchas

Common mistakes when connecting to external services and libraries.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude Code CLI `--resume` | Assuming session state is fully restored client-side. The `--resume` flag restores context on Claude's side, but your wrapper must also restore the local UI state (message history, tool results display) from your own storage | Store all messages in your database as they stream in. On resume, load history from your DB and pass `--resume <session-id>` to Claude Code. Don't rely on Claude Code's output to reconstruct past messages |
| better-sqlite3 + sqlite-vec | Calling `sqliteVec.load(db)` after the database connection is opened but before enabling WAL mode, or loading the extension inside a transaction | Load the extension immediately after opening the connection, before any queries. Enable WAL mode right after: `db.pragma('journal_mode = WAL')` |
| node-llama-cpp (ESM-only) | Using `require()` to import node-llama-cpp in a CommonJS project. It is ESM-only and will fail | Ensure your project uses `"type": "module"` in package.json or use dynamic `import()`. TanStack Start uses Vite which handles ESM natively, but server-side code paths need attention |
| Claude Code `--output-format stream-json` | Not passing `--print` / `-p` flag alongside `--output-format stream-json`. Interactive mode and stream-json are different operational modes | Always use `-p --output-format stream-json` for programmatic consumption. Use `--include-partial-messages` if you need token-level streaming granularity |
| TanStack Start server functions | Returning a `ReadableStream` from `createServerFn` but not handling client-side stream consumption correctly, or expecting the stream to auto-reconnect on failure | Use async generators in `createServerFn` for cleaner streaming. On the client, consume with proper error boundaries and implement manual reconnection logic |
| Claude Code `--dangerously-skip-permissions` | Using this flag in development and forgetting to remove it, or assuming `--allowedTools` is equivalent | Use `--allowedTools` with specific patterns (e.g., `"Bash(git log *)"`) for controlled permission grants. Never ship `--dangerously-skip-permissions` in any user-facing configuration |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Brute-force vector search without quantization | Search latency grows linearly with memory count | Use int8 quantization (sqlite-vec supports it). Reduces memory 4x with minimal accuracy loss for retrieval | >50K memories with 768+ dimensions (search time exceeds 200ms) |
| Re-embedding unchanged content | Embedding computation doubles when content is updated but text is unchanged | Hash content before embedding. Only re-embed if hash differs. Store content hash alongside embedding | At any scale -- wastes CPU/GPU on every duplicate |
| Unbounded message history in SSE stream | Browser memory grows as conversation accumulates thousands of tokens in React state | Implement message windowing: only keep the last N messages in DOM, virtualize older ones. Store full history in DB | >100 messages in a single session, or sessions with large tool outputs |
| No connection pooling for SQLite | Each request opens a new database connection, paying WAL acquisition cost each time | Use a singleton `better-sqlite3` connection (it is synchronous and single-threaded, so one connection is correct). Do NOT create a connection pool for better-sqlite3 -- it is not needed and is an anti-pattern | Immediate -- better-sqlite3 is designed for single-connection use |
| Synchronous embedding in the request path | UI freezes while computing embeddings for memory storage | Queue embedding jobs and process them asynchronously. Return immediately to the user. Use a simple in-process queue (no need for Redis for single-user) | First time the user tries to save a memory of more than a few sentences |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Passing user input directly as Claude Code `--system-prompt` or `-p` argument without sanitization | Shell injection: user input containing backticks, `$()`, or semicolons can execute arbitrary commands on the host | Use `spawn()` with argument arrays (not string concatenation). Never pass user input through a shell. Use `--input-format stream-json` to pipe prompts via stdin instead of CLI arguments |
| Running Claude Code with `--dangerously-skip-permissions` in production | Claude Code can execute any shell command, modify any file, make any network request without user approval | Use `--allowedTools` with explicit patterns. Use `--permission-mode plan` for read-only exploration. Never skip permissions on a server-accessible instance |
| MCP server exposing tools without authentication | Any process that can connect to the MCP server can invoke tools, potentially accessing the filesystem, databases, or APIs | Implement user-scoped authentication for MCP tools. Use the principle of least privilege. When building an MCP server for Wrex, scope tools to the current user's data only |
| Storing API keys or session tokens in SQLite without encryption | If the SQLite database file is accessible (backup, theft, debug dump), all credentials are exposed in plaintext | Store sensitive tokens in environment variables or OS keychain, not in the database. If session tokens must be stored, use at-rest encryption |
| Not sanitizing Claude Code tool output before rendering in the UI | Cross-site scripting (XSS) if Claude Code returns HTML/JS in tool results that gets rendered without escaping | Always sanitize tool output before rendering. Use a strict allowlist of HTML elements for markdown rendering. Never use `dangerouslySetInnerHTML` with unsanitized content |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No feedback during Claude Code startup delay | User types a message, presses send, and nothing happens for 2-5 seconds while the CLI process spawns and initializes | Show an immediate "thinking" indicator the moment the user submits. Display a typing indicator / skeleton while waiting for the first token |
| Markdown rendering flickers during streaming | Code blocks partially render with broken syntax highlighting, then jump when the block completes. Content height changes cause scroll position to jump | Render streaming content as plain text with monospace font. Only apply full markdown rendering after the stream completes or after a 500ms pause in tokens |
| No way to stop a runaway response | Claude Code enters a long agentic loop (10+ tool calls) and the user cannot interrupt it | Implement a prominent "Stop" button that sends SIGINT to the child process. Use Claude Code's `--max-turns` as a server-side safety net |
| Session resume loses scroll position and UI state | User returns to a previous session and is dumped at the top of a long conversation with no context of where they left off | Persist scroll position and last-viewed message ID. On resume, scroll to the last position. Show a "new messages below" indicator if applicable |
| Tool execution results shown as raw JSON | Claude Code tool results (file reads, bash output, search results) displayed as raw JSON blobs are unreadable | Parse known tool result types and render them with appropriate formatting: code with syntax highlighting, file trees with indentation, diffs with color coding |
| Embedding/memory operations block the UI | User saves a note to memory and the UI freezes while the embedding is computed | Show an immediate "Saved" confirmation with a subtle "indexing..." indicator. Compute embeddings asynchronously. The memory is searchable by text immediately, and by vector after indexing completes |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **NDJSON parser:** Often missing handling for the final `close`/`exit` event -- the last line may not end with `\n`, so the buffer flush on stream end must be implemented
- [ ] **Process cleanup:** Often missing cleanup on `SIGTERM`/`SIGINT` -- test by killing the parent process and verifying no child processes remain
- [ ] **SQLite WAL mode:** Often missing `PRAGMA wal_checkpoint(TRUNCATE)` on graceful shutdown -- the WAL file can grow to gigabytes if never checkpointed
- [ ] **Session resume:** Often missing the distinction between Claude Code's `--resume` (server-side context) and your app's UI state restoration -- both must work together
- [ ] **Embedding model:** Often missing warm-up -- first embedding after model load may be slower than subsequent ones due to GPU kernel compilation. Run a throwaway embedding at startup
- [ ] **SSE connection:** Often missing reconnection logic -- the `EventSource` API auto-reconnects but custom `fetch`-based SSE implementations do not
- [ ] **Error display:** Often missing user-friendly error messages when Claude Code exits with non-zero status -- parse stderr for known error patterns (rate limit, auth failure, network) and display actionable messages
- [ ] **MCP server:** Often missing graceful shutdown -- the server must respond to `shutdown` protocol messages and clean up resources, not just crash on SIGTERM
- [ ] **Memory search:** Often missing fallback to text search when vector search returns no results above the similarity threshold -- users expect "something" to come back
- [ ] **Concurrent sessions:** Often missing per-session isolation -- ensure that events from Session A never leak to Session B's SSE stream

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| NDJSON split-chunk parsing bugs | LOW | Drop in `split2` or rewrite the transform stream. No data loss since Claude Code can be re-run |
| Zombie process accumulation | MEDIUM | Kill all Claude processes (`pkill -f "claude"`), restart server. Add PID tracking and cleanup hooks. No data loss |
| Event loop blocked by model loading | LOW | Move model loading to startup sequence. Single code change. No architectural change needed |
| sqlite-vec schema redesign (vectors in wrong table) | HIGH | Requires data migration: export memories, recreate tables with proper two-table schema, re-embed all content. Plan for 1-2 days of work |
| Streaming UI jank | MEDIUM | Implement token batching and deferred markdown rendering. May require refactoring the message component tree. Plan for 0.5-1 day |
| MCP stdout corruption | LOW | Replace all `console.log` with `console.error`. Audit dependencies. Usually a quick fix once diagnosed |
| SSE connection exhaustion | MEDIUM | Switch to HTTP/2 or implement connection multiplexing. May require server configuration changes. Plan for 0.5 day |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| NDJSON stream splitting | Phase 1 - CLI Process Wrapper | Unit test with artificially split chunks; integration test with real Claude Code output |
| Zombie process accumulation | Phase 1 - CLI Process Wrapper | Stress test: spawn 10 sessions, kill parent, verify 0 orphaned processes. Add process count to health endpoint |
| Model loading blocks event loop | Phase 2 - Memory System | Measure server response time during model load. Should be <10ms for non-embedding endpoints |
| sqlite-vec virtual table schema | Phase 2 - Memory System | Schema review before implementation. Verify JOIN queries return correct results with test data |
| Streaming UI rendering jank | Phase 3 - Chat UI | Performance profiling with Chrome DevTools during real streaming. Target <16ms frame times (60fps) |
| MCP stdout corruption | Phase 4 - MCP Integration | MCP Inspector validation. Integration test that starts the MCP server and exchanges valid JSON-RPC |
| SSE connection limits | Phase 3 - Chat UI | Test with 3+ tabs open simultaneously. Verify all streams receive events |
| Shell injection via CLI args | Phase 1 - CLI Process Wrapper | Security review of all `spawn()` calls. Verify no string interpolation in command arguments |
| WAL checkpoint starvation | Phase 2 - Memory System | Monitor WAL file size during test runs. Verify it stays bounded (< 10MB for typical usage) |
| Embedding blocks request path | Phase 2 - Memory System | Measure request latency for memory save operations. Should return to user in <100ms regardless of embedding time |

## Sources

- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference) - Official docs on --output-format stream-json, --resume, --print flags (HIGH confidence)
- [Claude Code process forking bug](https://shivankaul.com/blog/claude-code-process-exhaustion) - Real-world zombie process issue and wrapper fix (HIGH confidence)
- [Node.js child_process docs](https://nodejs.org/api/child_process.html) - spawn() buffer limits, stream behavior (HIGH confidence)
- [sqlite-vec stable release blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html) - Brute-force limitations, virtual table design, quantization (HIGH confidence)
- [node-llama-cpp troubleshooting](https://node-llama-cpp.withcat.ai/guide/troubleshooting) - InsufficientMemoryError, ESM-only, platform issues (HIGH confidence)
- [Implementing MCP: Tips, Tricks, and Pitfalls](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/) - stdout corruption, schema testing, framework selection (HIGH confidence)
- [MCP stdio mode corruption issue](https://github.com/ruvnet/claude-flow/issues/835) - console.log corrupts JSON-RPC on stdio transport (HIGH confidence)
- [Streaming LLM Responses Web Guide](https://pockit.tools/blog/streaming-llm-responses-web-guide/) - Backpressure, proxy buffering, rendering performance (MEDIUM confidence)
- [TanStack Start streaming docs](https://tanstack.com/start/latest/docs/framework/react/guide/streaming-data-from-server-functions) - createServerFn with ReadableStream and async generators (HIGH confidence)
- [TanStack AI SSE protocol](https://tanstack.com/ai/latest/docs/protocol/sse-protocol) - SSE as recommended streaming protocol (HIGH confidence)
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) - WAL mode, checkpoint starvation, concurrency (HIGH confidence)
- [MDN Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) - HTTP/1.1 6-connection limit per domain (HIGH confidence)
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25) - Security considerations, protocol requirements (HIGH confidence)
- [Node.js zombie process issues](https://github.com/nodejs/node/issues/14445) - Child process cleanup on restart (MEDIUM confidence)

---
*Pitfalls research for: Wrex - AI assistant CLI wrapper with streaming, memory, and chat UI*
*Researched: 2026-02-12*
