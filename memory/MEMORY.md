# Wrex Project Memory

## Architecture
- TanStack Start + Vite 7 + better-sqlite3 + Drizzle ORM
- Claude Code CLI spawned as child process with NDJSON streaming
- MCP server exposes memory_search, memory_get, memory_write tools
  - **HTTP transport** at `/api/mcp` (primary, via WebStandardStreamableHTTPServerTransport)
  - **stdio transport** at `src/mcp-server.ts` (fallback for direct CLI use)
  - Shared tool registration in `src/lib/mcp/tools.ts`
- SSE streaming via ReadableStream through srvx's `sendNodeResponse`
- System prompt builder at `src/lib/claude/system-prompt.ts` with modular sections
- Agent workspace isolated at `data/workspace/` (cwd for Claude child process)

## Critical Bugs Found & Fixed
- **Claude CLI stdin hang**: When spawning `claude -p` with `stdio: ['pipe', 'pipe', 'pipe']`, must call `child.stdin.end()` immediately. Claude CLI hangs waiting for stdin to close, producing zero output. See `process-manager.ts:65`.

## TanStack Start v1.159.5 Quirks
- Uses Vite 7 (not 6) as peer dependency
- server.tsx exports `{ fetch }` (not default), router.tsx exports `getRouter()`
- No `createServerFileRoute` API - intercept routes in server.tsx fetch handler
- Dev server uses srvx's `sendNodeResponse` for response streaming (supports ReadableStream natively)
- Drizzle `.findFirst()` returns query builder, needs `.sync()` for synchronous execution
- Dev server runs on port 5173 (Vite default)

## SQLite / sqlite-vec Quirks
- vec0 integer type affinity requires `CAST(? AS INTEGER)` workaround
- `Buffer.from(Float32Array)` needed (not raw ArrayBuffer) for vec0 inserts

## Project Structure
- `/workspaces/assistant` - project root
- `src/lib/claude/` - Claude CLI integration (process-manager, chat-handler, ndjson-parser, types, system-prompt)
- `src/lib/memory/` - Memory pipeline (chunker, embedder, indexer, search, types)
- `src/lib/mcp/` - MCP server (tools.ts shared registration, http-handler.ts HTTP transport)
- `src/lib/db/` - Database (index, schema)
- `src/mcp-server.ts` - MCP stdio server (fallback)
- `.mcp.json` - Claude Code MCP config (HTTP transport, port 5173)
- `data/workspace/` - Agent workspace (cwd, memory files, gitignored)
- `data/wrex.db` - SQLite database