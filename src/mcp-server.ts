/**
 * MCP server entry point for wrex-memory.
 *
 * Exposes three tools over stdio:
 *   - memory_search: hybrid vector + keyword search across memory files
 *   - memory_get: read a specific memory file by path
 *   - memory_write: persist content to a memory file and re-index
 *
 * CRITICAL: This is a stdio-based MCP server.
 * NEVER use console.log() -- all stdout writes corrupt JSON-RPC transport.
 * Use console.error() for all logging/diagnostics.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { hybridSearch } from "./lib/memory/search.js";
import { reindexFile, ensureTables } from "./lib/memory/indexer.js";
import { disposeEmbedder } from "./lib/memory/embedder.js";

const MEMORY_DIR = resolve(process.cwd(), "memory");

const server = new McpServer({
  name: "wrex-memory",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// memory_search: natural language hybrid search across indexed memory files
// ---------------------------------------------------------------------------
server.tool(
  "memory_search",
  "Search memories using natural language. Returns ranked snippets with file paths, relevance scores, and content previews.",
  {
    query: z.string().describe("Natural language search query"),
    limit: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of results to return"),
  },
  async ({ query, limit }) => {
    try {
      const results = await hybridSearch(query, limit);

      if (results.length === 0) {
        return {
          content: [
            { type: "text", text: `No relevant memories found for: ${query}` },
          ],
        };
      }

      const formatted = results
        .map((r, i) => {
          const sources = r.sources.join(", ");
          const preview = r.content.slice(0, 200).replace(/\n/g, " ");
          return [
            `### ${i + 1}. ${r.heading || "(no heading)"}`,
            `**File:** ${r.filePath}  `,
            `**Lines:** ${r.startLine}-${r.endLine}  `,
            `**Score:** ${r.score.toFixed(4)} (${sources})`,
            ``,
            `${preview}${r.content.length > 200 ? "..." : ""}`,
          ].join("\n");
        })
        .join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} result(s) for: "${query}"\n\n${formatted}`,
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mcp] memory_search error: ${message}`);
      return {
        content: [
          { type: "text", text: `Search failed: ${message}` },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// memory_get: read a specific memory file by path
// ---------------------------------------------------------------------------
server.tool(
  "memory_get",
  "Read a specific memory file by path, optionally extracting a line range.",
  {
    path: z
      .string()
      .describe("Path to memory file relative to memory/ directory"),
    startLine: z
      .number()
      .optional()
      .describe("Start line number (1-indexed, inclusive)"),
    endLine: z
      .number()
      .optional()
      .describe("End line number (1-indexed, inclusive)"),
  },
  async ({ path: filePath, startLine, endLine }) => {
    const fullPath = resolve(join(MEMORY_DIR, filePath));

    // Security: prevent path traversal
    if (!fullPath.startsWith(MEMORY_DIR)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Path traversal detected. Path must be within the memory/ directory.`,
          },
        ],
        isError: true,
      };
    }

    if (!existsSync(fullPath)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: File not found: memory/${filePath}`,
          },
        ],
        isError: true,
      };
    }

    try {
      let content = readFileSync(fullPath, "utf-8");

      if (startLine !== undefined || endLine !== undefined) {
        const lines = content.split("\n");
        const start = (startLine ?? 1) - 1; // convert to 0-indexed
        const end = endLine ?? lines.length;
        content = lines.slice(start, end).join("\n");
      }

      return {
        content: [{ type: "text", text: content }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mcp] memory_get error: ${message}`);
      return {
        content: [
          { type: "text", text: `Error reading file: ${message}` },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// memory_write: persist content and re-index
// ---------------------------------------------------------------------------
server.tool(
  "memory_write",
  "Write content to a memory file (markdown format) and re-index it so new content becomes immediately searchable.",
  {
    path: z
      .string()
      .describe("Path to memory file relative to memory/ directory"),
    content: z.string().describe("Content to write (markdown format)"),
    mode: z
      .enum(["append", "overwrite"])
      .optional()
      .default("append")
      .describe("append adds to end of file, overwrite replaces entire file"),
  },
  async ({ path: filePath, content, mode }) => {
    const fullPath = resolve(join(MEMORY_DIR, filePath));

    // Security: prevent path traversal
    if (!fullPath.startsWith(MEMORY_DIR)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Path traversal detected. Path must be within the memory/ directory.`,
          },
        ],
        isError: true,
      };
    }

    try {
      // Ensure parent directories exist
      mkdirSync(dirname(fullPath), { recursive: true });

      if (mode === "append") {
        const existing = existsSync(fullPath)
          ? readFileSync(fullPath, "utf-8")
          : "";
        const newContent = existing
          ? existing + "\n" + content
          : content;
        writeFileSync(fullPath, newContent, "utf-8");
      } else {
        writeFileSync(fullPath, content, "utf-8");
      }

      // Re-index so content is immediately searchable
      const chunkCount = await reindexFile(fullPath);

      return {
        content: [
          {
            type: "text",
            text: `Written to memory/${filePath} and re-indexed (${chunkCount} chunks).`,
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mcp] memory_write error: ${message}`);
      return {
        content: [
          { type: "text", text: `Error writing file: ${message}` },
        ],
        isError: true,
      };
    }
  },
);

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
