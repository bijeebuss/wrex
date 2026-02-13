/**
 * HTTP MCP endpoint handler for /api/mcp.
 *
 * Uses WebStandardStreamableHTTPServerTransport (stateful mode) so each
 * Claude Code child process gets its own MCP session with persistent state.
 *
 * Session lifecycle:
 *   1. POST without mcp-session-id → new transport + server, tools registered
 *   2. POST with mcp-session-id → routed to existing session
 *   3. DELETE with mcp-session-id → cleanup
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ensureTables } from "../memory/indexer.js";
import { registerMemoryTools } from "./tools.js";

interface McpSession {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
}

const sessions = new Map<string, McpSession>();

let tablesEnsured = false;
function ensureTablesOnce() {
  if (!tablesEnsured) {
    ensureTables();
    tablesEnsured = true;
  }
}

/**
 * Handle an incoming HTTP request to /api/mcp.
 * Supports POST (JSON-RPC), GET (SSE stream), and DELETE (session cleanup).
 */
export async function handleMcpRequest(request: Request): Promise<Response> {
  ensureTablesOnce();

  const sessionId = request.headers.get("mcp-session-id");

  // Route to existing session if we have a session ID
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    return session.transport.handleRequest(request);
  }

  // If client sends a session ID we don't recognize, reject
  if (sessionId) {
    return new Response(
      JSON.stringify({ error: "Session not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // New session: create transport + server, register tools, connect
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, { transport, server });
      console.error(`[mcp-http] Session created: ${id}`);
    },
    onsessionclosed: (id) => {
      sessions.delete(id);
      console.error(`[mcp-http] Session closed: ${id}`);
    },
  });

  const server = new McpServer({
    name: "wrex-memory",
    version: "0.1.0",
  });

  registerMemoryTools(server);
  await server.connect(transport);

  return transport.handleRequest(request);
}
