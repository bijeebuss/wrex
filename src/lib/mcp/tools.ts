/**
 * Shared MCP tool registrations for wrex-memory.
 *
 * Used by both the stdio server (src/mcp-server.ts) and the HTTP handler
 * (src/lib/mcp/http-handler.ts) so tool logic isn't duplicated.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { hybridSearch } from "../memory/search.js";
import { reindexFile, removeFileIndex } from "../memory/indexer.js";

/**
 * Resolve the memory directory path.
 * Defaults to `./data/workspace/memory` relative to cwd.
 */
export function getMemoryDir(): string {
  return resolve(process.env.MEMORY_DIR || "./data/workspace/memory");
}

/**
 * Register the three memory tools (memory_search, memory_get, memory_write)
 * on the given McpServer instance.
 */
export function registerMemoryTools(server: McpServer): void {
  const MEMORY_DIR = getMemoryDir();

  // ---------------------------------------------------------------------------
  // memory_search
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
              { type: "text" as const, text: `No relevant memories found for: ${query}` },
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
              type: "text" as const,
              text: `Found ${results.length} result(s) for: "${query}"\n\n${formatted}`,
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[mcp] memory_search error: ${message}`);
        return {
          content: [
            { type: "text" as const, text: `Search failed: ${message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // memory_get
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
              type: "text" as const,
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
              type: "text" as const,
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
          const start = (startLine ?? 1) - 1;
          const end = endLine ?? lines.length;
          content = lines.slice(start, end).join("\n");
        }

        return {
          content: [{ type: "text" as const, text: content }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[mcp] memory_get error: ${message}`);
        return {
          content: [
            { type: "text" as const, text: `Error reading file: ${message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // memory_write
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
              type: "text" as const,
              text: `Error: Path traversal detected. Path must be within the memory/ directory.`,
            },
          ],
          isError: true,
        };
      }

      try {
        mkdirSync(dirname(fullPath), { recursive: true });

        if (mode === "append") {
          const existing = existsSync(fullPath)
            ? readFileSync(fullPath, "utf-8")
            : "";
          const newContent = existing ? existing + "\n" + content : content;
          writeFileSync(fullPath, newContent, "utf-8");
        } else {
          writeFileSync(fullPath, content, "utf-8");
        }

        const chunkCount = await reindexFile(fullPath);

        return {
          content: [
            {
              type: "text" as const,
              text: `Written to memory/${filePath} and re-indexed (${chunkCount} chunks).`,
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[mcp] memory_write error: ${message}`);
        return {
          content: [
            { type: "text" as const, text: `Error writing file: ${message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // memory_list
  // ---------------------------------------------------------------------------
  server.tool(
    "memory_list",
    "List memory files with metadata (size, last modified). Returns filenames, not contents.",
    {
      directory: z
        .string()
        .optional()
        .default("")
        .describe("Subdirectory to list, relative to memory/ root. Empty for top-level."),
    },
    async ({ directory }) => {
      const targetDir = resolve(join(MEMORY_DIR, directory));

      if (!targetDir.startsWith(MEMORY_DIR)) {
        return {
          content: [
            { type: "text" as const, text: "Error: Path traversal detected." },
          ],
          isError: true,
        };
      }

      if (!existsSync(targetDir)) {
        return {
          content: [
            { type: "text" as const, text: `Directory not found: memory/${directory}` },
          ],
          isError: true,
        };
      }

      try {
        const entries = collectFiles(targetDir, MEMORY_DIR);

        if (entries.length === 0) {
          return {
            content: [
              { type: "text" as const, text: `No files found in memory/${directory}` },
            ],
          };
        }

        const formatted = entries
          .map((e) => `- ${e.path}  (${formatBytes(e.size)}, modified ${e.modified})`)
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `${entries.length} file(s) in memory/${directory}\n\n${formatted}`,
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[mcp] memory_list error: ${message}`);
        return {
          content: [
            { type: "text" as const, text: `Error listing files: ${message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // memory_reindex
  // ---------------------------------------------------------------------------
  server.tool(
    "memory_reindex",
    "Re-index a memory file (or all files) to sync the search index after manual edits or deletions.",
    {
      path: z
        .string()
        .optional()
        .describe("Path to a specific file to re-index, relative to memory/. Omit to re-index all files."),
    },
    async ({ path: filePath }) => {
      try {
        if (filePath) {
          const fullPath = resolve(join(MEMORY_DIR, filePath));

          if (!fullPath.startsWith(MEMORY_DIR)) {
            return {
              content: [
                { type: "text" as const, text: "Error: Path traversal detected." },
              ],
              isError: true,
            };
          }

          if (!existsSync(fullPath)) {
            // File was deleted — remove from index
            removeFileIndex(fullPath);
            return {
              content: [
                { type: "text" as const, text: `memory/${filePath} not found on disk. Removed from search index.` },
              ],
            };
          }

          const chunkCount = await reindexFile(fullPath);
          return {
            content: [
              { type: "text" as const, text: `Re-indexed memory/${filePath} (${chunkCount} chunks).` },
            ],
          };
        }

        // Re-index all files
        const allFiles = collectFiles(MEMORY_DIR, MEMORY_DIR).filter((e) =>
          e.path.endsWith(".md"),
        );

        let totalChunks = 0;
        for (const entry of allFiles) {
          const fullPath = resolve(join(MEMORY_DIR, entry.path));
          const count = await reindexFile(fullPath);
          totalChunks += count;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Re-indexed ${allFiles.length} file(s), ${totalChunks} total chunks.`,
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[mcp] memory_reindex error: ${message}`);
        return {
          content: [
            { type: "text" as const, text: `Error re-indexing: ${message}` },
          ],
          isError: true,
        };
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FileEntry {
  path: string;
  size: number;
  modified: string;
}

function collectFiles(dir: string, baseDir: string): FileEntry[] {
  const entries: FileEntry[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      entries.push(...collectFiles(full, baseDir));
    } else {
      entries.push({
        path: relative(baseDir, full),
        size: stat.size,
        modified: stat.mtime.toISOString().slice(0, 10),
      });
    }
  }
  return entries;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
