/**
 * MCP server entry point for wrex-memory (stdio transport).
 *
 * Kept as a fallback for direct CLI usage (`npx tsx src/mcp-server.ts`).
 * The HTTP transport at /api/mcp is the primary transport for the web app.
 *
 * CRITICAL: This is a stdio-based MCP server.
 * NEVER use console.log() -- all stdout writes corrupt JSON-RPC transport.
 * Use console.error() for all logging/diagnostics.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ensureTables } from "./lib/memory/indexer.js";
import { disposeEmbedder } from "./lib/memory/embedder.js";
import { registerMemoryTools } from "./lib/mcp/tools.js";

const server = new McpServer({
  name: "wrex-memory",
  version: "0.1.0",
});

registerMemoryTools(server);

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
async function main() {
  ensureTables();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("wrex-memory MCP server running on stdio");
}

// Graceful shutdown
function shutdown() {
  console.error("[mcp] Shutting down...");
  disposeEmbedder()
    .then(() => server.close())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
