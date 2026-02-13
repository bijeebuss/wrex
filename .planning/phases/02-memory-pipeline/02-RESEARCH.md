# Phase 2: Memory Pipeline - Research

**Researched:** 2026-02-12
**Domain:** Local embedding, vector search, FTS5 hybrid search, MCP server tools
**Confidence:** MEDIUM-HIGH

## Summary

This phase builds a complete memory system for an AI assistant: markdown files are chunked, embedded locally using node-llama-cpp with a nomic-embed GGUF model, indexed in SQLite (sqlite-vec for vectors, FTS5 for keywords), and exposed via MCP tools that Claude Code can call. The architecture is split across three plans: (1) embedding service + markdown chunker, (2) SQLite vector/FTS storage with hybrid RRF-scored search, and (3) MCP server with memory_search, memory_get, and memory_write tools.

The stack is well-defined by Phase 1 decisions: better-sqlite3 with Drizzle ORM, sqlite-vec v0.1.7-alpha.2 already loaded. The key new additions are node-llama-cpp for local embedding inference and @modelcontextprotocol/sdk for the MCP server. The nomic-embed-text-v1.5 GGUF model provides 768-dimensional embeddings with task-prefix awareness, which is critical -- documents must be prefixed with `search_document: ` and queries with `search_query: ` for correct retrieval. Markdown chunking should be heading-aware (split at ## boundaries) with configurable chunk size around 400-512 tokens and 10-20% overlap.

**Primary recommendation:** Use node-llama-cpp v3.x with nomic-embed-text-v1.5 Q8_0 GGUF (140 MiB, near-lossless) for embeddings, store 768-dim float vectors in sqlite-vec vec0 virtual tables, index chunk text in FTS5 with bm25 ranking, combine results via Reciprocal Rank Fusion (k=60), and serve over MCP stdio transport using @modelcontextprotocol/sdk's McpServer + StdioServerTransport.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node-llama-cpp | ^3.15.x | Local GGUF model inference for embeddings | Only mature Node.js binding for llama.cpp; supports embedding via createEmbeddingContext |
| @modelcontextprotocol/sdk | ^1.24.x | MCP server framework | Official TypeScript SDK for Model Context Protocol; used by Claude Code |
| better-sqlite3 | ^12.6.2 | SQLite driver (Phase 1, already installed) | Synchronous API, fast, extension-loadable |
| sqlite-vec | ^0.1.7-alpha.2 | Vector search extension (Phase 1, already loaded) | Only SQLite vector extension with npm package; loaded in db singleton |
| drizzle-orm | ^0.45.1 | SQL query builder (Phase 1, already installed) | Type-safe SQL, works with better-sqlite3 |
| zod | ^3.24.0 | Schema validation (Phase 1, already installed) | Required by MCP SDK for tool input schemas |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nomic-embed-text-v1.5 GGUF (Q8_0) | v1.5 | Embedding model file | Download once at setup; 140 MiB, 768-dim output |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| nomic-embed-text-v1.5 | nomic-embed-text-v2-moe | v2 is MoE, larger (273-958 MiB), better multilingual; v1.5 is simpler, smaller, well-tested |
| Q8_0 quantization | Q6_K (108 MiB) | Q6_K saves 32 MiB with minimal quality loss (MSE 5.58e-05 vs 5.79e-06); Q8_0 is near-lossless |
| Custom markdown splitter | langchain text splitters | Adds heavy dependency for simple heading-aware split; custom is fine for markdown |
| sqlite-vec | pgvector, Qdrant | Would require separate database; sqlite-vec keeps everything in single wrex.db file |

**Installation:**
```bash
npm install node-llama-cpp @modelcontextprotocol/sdk
```

**Model download (add to package.json scripts):**
```bash
npx node-llama-cpp pull --dir ./models hf:nomic-ai/nomic-embed-text-v1.5-GGUF:Q8_0
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  lib/
    db/
      index.ts           # existing: db + sqlite exports
      schema.ts          # existing + new memory tables
    memory/
      chunker.ts         # markdown heading-aware chunker
      embedder.ts        # node-llama-cpp embedding service (singleton)
      indexer.ts          # orchestrates chunk + embed + store
      search.ts          # hybrid search (vec + FTS5 + RRF)
    mcp/
      server.ts          # McpServer with stdio transport
      tools/
        memory-search.ts # memory_search tool handler
        memory-get.ts    # memory_get tool handler
        memory-write.ts  # memory_write tool handler
  mcp-server.ts          # entry point for MCP server process
data/
  wrex.db                # existing SQLite database
memory/
  MEMORY.md              # primary memory file
  *.md                   # additional memory files
models/
  nomic-embed-text-v1.5.Q8_0.gguf  # downloaded model (gitignored)
```

### Pattern 1: Singleton Embedding Service
**What:** A single embedding context loaded once and reused across all embedding operations.
**When to use:** Always -- loading the GGUF model is expensive (~seconds), embedding is fast once loaded.
**Example:**
```typescript
// Source: https://node-llama-cpp.withcat.ai/guide/embedding
import { getLlama, resolveModelFile } from "node-llama-cpp";
import path from "node:path";

let embeddingContext: Awaited<ReturnType<Awaited<ReturnType<typeof getLlama>>["loadModel"]>["createEmbeddingContext"]>> | null = null;

export async function getEmbedder() {
  if (embeddingContext) return embeddingContext;

  const modelPath = await resolveModelFile(
    "hf:nomic-ai/nomic-embed-text-v1.5-GGUF:Q8_0",
    path.join(process.cwd(), "models")
  );
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath });
  embeddingContext = await model.createEmbeddingContext();
  return embeddingContext;
}

export async function embed(text: string, prefix: "search_document" | "search_query"): Promise<number[]> {
  const ctx = await getEmbedder();
  const embedding = await ctx.getEmbeddingFor(`${prefix}: ${text}`);
  return Array.from(embedding.vector);
}
```

### Pattern 2: Heading-Aware Markdown Chunking
**What:** Split markdown at heading boundaries (## and ###), respecting document structure, with configurable max size and overlap.
**When to use:** When indexing markdown memory files for RAG retrieval.
**Example:**
```typescript
interface Chunk {
  content: string;
  filePath: string;
  heading: string;      // nearest parent heading
  startLine: number;
  endLine: number;
}

function chunkMarkdown(content: string, filePath: string, opts?: { maxTokens?: number }): Chunk[] {
  const maxTokens = opts?.maxTokens ?? 512;
  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  let currentHeading = "";
  let currentChunk: string[] = [];
  let chunkStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);

    if (headingMatch && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.join("\n"),
        filePath,
        heading: currentHeading,
        startLine: chunkStartLine,
        endLine: i,
      });
      currentChunk = [];
      chunkStartLine = i + 1;
    }

    if (headingMatch) {
      currentHeading = headingMatch[2];
    }
    currentChunk.push(line);
  }

  if (currentChunk.length > 0) {
    chunks.push({
      content: currentChunk.join("\n"),
      filePath,
      heading: currentHeading,
      startLine: chunkStartLine,
      endLine: lines.length,
    });
  }

  return chunks;
}
```

### Pattern 3: Hybrid Search with Reciprocal Rank Fusion
**What:** Run vector similarity and FTS5 keyword search independently, merge results using RRF scoring.
**When to use:** Always for memory_search -- hybrid consistently outperforms either method alone.
**Example:**
```typescript
// Source: RRF algorithm from academic literature and Azure/OpenSearch implementations
const RRF_K = 60; // standard constant

function reciprocalRankFusion(
  vectorResults: { id: string; rank: number }[],
  ftsResults: { id: string; rank: number }[],
  k: number = RRF_K
): { id: string; score: number }[] {
  const scores = new Map<string, number>();

  for (const { id, rank } of vectorResults) {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (rank + k));
  }
  for (const { id, rank } of ftsResults) {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (rank + k));
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
```

### Pattern 4: MCP Server with StdioServerTransport
**What:** Standalone Node.js process that serves MCP tools over stdio.
**When to use:** For the memory MCP server that Claude Code connects to.
**Example:**
```typescript
// Source: https://modelcontextprotocol.io/docs/develop/build-server (TypeScript tab)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "wrex-memory",
  version: "0.1.0",
});

server.registerTool(
  "memory_search",
  {
    description: "Search memory for relevant information using natural language query",
    inputSchema: {
      query: z.string().describe("Natural language search query"),
      limit: z.number().optional().default(5).describe("Max results to return"),
    },
  },
  async ({ query, limit }) => {
    // hybrid search implementation
    const results = await hybridSearch(query, limit);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(results, null, 2),
      }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("wrex-memory MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

### Anti-Patterns to Avoid
- **console.log in MCP server:** NEVER use console.log() in a stdio MCP server. It writes to stdout and corrupts JSON-RPC messages. Use console.error() for all logging.
- **Loading model per request:** NEVER create a new embedding context for each search query. Model loading takes seconds; reuse a singleton.
- **Embedding without task prefix:** NEVER embed text without the `search_document: ` or `search_query: ` prefix for nomic-embed models. Results will be semantically wrong.
- **Mixing embeddings from different models:** NEVER compare vectors from different models or quantizations. Always use the exact same model file.
- **Raw score comparison between vec and FTS5:** NEVER compare sqlite-vec distances with FTS5 bm25 scores directly. They are on different scales. Use rank-based fusion (RRF).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector similarity search | Custom brute-force distance calculation | sqlite-vec vec0 MATCH query | Handles KNN efficiently, indexed, supports metadata filtering |
| Full-text keyword search | Custom tokenizer + inverted index | SQLite FTS5 with bm25 | Built into SQLite, handles stemming/tokenization, proven at scale |
| Embedding inference | Custom ONNX/TF runtime | node-llama-cpp | Handles GGUF loading, GPU offload, batching, memory management |
| MCP protocol | Custom JSON-RPC over stdio | @modelcontextprotocol/sdk | Handles protocol negotiation, transport, message framing, tool schemas |
| Result ranking fusion | Custom score normalization | RRF algorithm (simple formula) | Score normalization is fragile; RRF is rank-based, robust, tuning-free |
| GGUF model download | Manual fetch + cache management | node-llama-cpp resolveModelFile | Handles caching, HuggingFace auth, deduplication |

**Key insight:** The memory pipeline combines four different subsystems (embedding, vector DB, text search, MCP protocol). Each has battle-tested solutions. Hand-rolling any one of them would likely take weeks and produce inferior results. The value is in the integration, not the components.

## Common Pitfalls

### Pitfall 1: Missing Task Prefix on Embeddings
**What goes wrong:** Search returns irrelevant results despite correct vectors being stored.
**Why it happens:** nomic-embed-text models are trained with task prefixes. Documents embedded without `search_document: ` prefix produce vectors in a different region of the embedding space than queries with `search_query: ` prefix.
**How to avoid:** Create a wrapper function that enforces the prefix. Never call getEmbeddingFor() directly with raw text.
**Warning signs:** Search results have high distance scores even for obvious keyword matches.

### Pitfall 2: console.log in MCP stdio Server
**What goes wrong:** MCP server fails to connect, Claude Code shows "Connection closed" errors.
**Why it happens:** console.log() writes to stdout, which is the JSON-RPC transport channel. Any non-JSON-RPC data on stdout corrupts the protocol.
**How to avoid:** Use console.error() for ALL logging. Consider creating a logger utility that writes to stderr or a log file.
**Warning signs:** Server starts but Claude Code cannot discover tools.

### Pitfall 3: FTS5 Stale Index
**What goes wrong:** Newly written memory content is not found by keyword search.
**Why it happens:** FTS5 with external content tables requires explicit sync. If you insert/update the content table without also updating the FTS5 table, the index goes stale.
**How to avoid:** Use triggers (AFTER INSERT, AFTER DELETE, AFTER UPDATE on the chunks table) that sync FTS5, OR update FTS5 in the same transaction as the content table insert. Note: there is a known better-sqlite3 issue with triggers on FTS5 inside transactions with RETURNING clauses -- avoid RETURNING when FTS5 triggers are involved.
**Warning signs:** Vector search finds results but keyword search misses obvious terms.

### Pitfall 4: sqlite-vec Vector Format Mismatch
**What goes wrong:** INSERT fails or KNN returns wrong results.
**Why it happens:** sqlite-vec expects vectors as either JSON arrays (strings) or compact Float32Array buffers. Passing a JavaScript array directly will not work.
**How to avoid:** When using better-sqlite3, convert vectors to Float32Array and pass .buffer: `new Float32Array(vector).buffer`.
**Warning signs:** "datatype mismatch" errors or nonsensical distance values.

### Pitfall 5: Model Not Downloaded Before First Use
**What goes wrong:** MCP server crashes on startup because GGUF file is missing.
**Why it happens:** resolveModelFile auto-downloads, but first download can take minutes and may fail in CI/offline environments.
**How to avoid:** Add a `models:pull` script to package.json postinstall. Check for model existence at server startup with a clear error message. Use resolveModelFile which caches automatically.
**Warning signs:** ENOENT errors on model path, long startup times on first run.

### Pitfall 6: Embedding Dimension Mismatch
**What goes wrong:** INSERT into vec0 table fails with dimension error.
**Why it happens:** vec0 table is created with float[768] but the embedding model outputs a different dimension (e.g., if using a different model or Matryoshka truncation).
**How to avoid:** Hard-code the dimension constant (768 for nomic-embed-text-v1.5 full) and validate embedding vector length before insertion.
**Warning signs:** "dimension mismatch" or "expected 768 got X" errors.

## Code Examples

### Creating sqlite-vec Virtual Table with Metadata
```sql
-- Source: https://github.com/asg017/sqlite-vec and https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/
CREATE VIRTUAL TABLE IF NOT EXISTS vec_memory_chunks USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding float[768],
  file_path TEXT,
  +heading TEXT,
  +content TEXT,
  +start_line INTEGER,
  +end_line INTEGER
);
```
Note: `+` prefix columns are auxiliary (stored but not filterable in MATCH queries). `file_path` without `+` is a metadata column that CAN be filtered in MATCH queries.

### Inserting Vectors with better-sqlite3
```typescript
// Source: https://alexgarcia.xyz/sqlite-vec/js.html
const insertChunk = sqlite.prepare(`
  INSERT INTO vec_memory_chunks(chunk_id, embedding, file_path, heading, content, start_line, end_line)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function insertMemoryChunk(chunk: {
  id: number;
  embedding: number[];
  filePath: string;
  heading: string;
  content: string;
  startLine: number;
  endLine: number;
}) {
  const vecBuffer = new Float32Array(chunk.embedding).buffer;
  insertChunk.run(
    chunk.id,
    vecBuffer,
    chunk.filePath,
    chunk.heading,
    chunk.content,
    chunk.startLine,
    chunk.endLine
  );
}
```

### KNN Vector Search with sqlite-vec
```sql
-- Source: https://github.com/asg017/sqlite-vec
SELECT chunk_id, heading, content, file_path, start_line, end_line, distance
FROM vec_memory_chunks
WHERE embedding MATCH ?
  AND k = ?
ORDER BY distance;
```

### FTS5 Table and BM25 Search
```sql
-- Create FTS5 table for keyword search
CREATE VIRTUAL TABLE IF NOT EXISTS fts_memory_chunks USING fts5(
  content,
  heading,
  file_path,
  content_rowid='chunk_id'
);

-- Insert into FTS5 (keep in sync with vec_memory_chunks)
INSERT INTO fts_memory_chunks(rowid, content, heading, file_path)
VALUES (?, ?, ?, ?);

-- Search with BM25 ranking (lower = more relevant, scores are negative)
SELECT rowid, content, heading, file_path, rank
FROM fts_memory_chunks
WHERE fts_memory_chunks MATCH ?
ORDER BY rank
LIMIT ?;
```

### Claude Code MCP Configuration (.mcp.json)
```json
{
  "mcpServers": {
    "wrex-memory": {
      "type": "stdio",
      "command": "node",
      "args": ["./dist/mcp-server.js"]
    }
  }
}
```

### MCP Tool Registration with Zod Schema
```typescript
// Source: https://modelcontextprotocol.io/docs/develop/build-server (TypeScript)
// Source: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "wrex-memory",
  version: "0.1.0",
});

// memory_search: hybrid search returning ranked snippets
server.registerTool(
  "memory_search",
  {
    description: "Search memory for relevant knowledge. Returns ranked snippets with file paths and relevance scores.",
    inputSchema: {
      query: z.string().describe("Natural language search query"),
      limit: z.number().optional().default(5).describe("Maximum number of results"),
    },
  },
  async ({ query, limit }) => {
    const results = await hybridSearch(query, limit);
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

// memory_get: read specific file content
server.registerTool(
  "memory_get",
  {
    description: "Read specific memory file content by path and optional line range.",
    inputSchema: {
      path: z.string().describe("Path to memory file relative to memory/ directory"),
      startLine: z.number().optional().describe("Start line (1-indexed)"),
      endLine: z.number().optional().describe("End line (inclusive)"),
    },
  },
  async ({ path, startLine, endLine }) => {
    const content = await readMemoryFile(path, startLine, endLine);
    return {
      content: [{ type: "text", text: content }],
    };
  }
);

// memory_write: persist new information
server.registerTool(
  "memory_write",
  {
    description: "Write or append information to a memory file. New content becomes searchable after indexing.",
    inputSchema: {
      path: z.string().describe("Path to memory file relative to memory/ directory"),
      content: z.string().describe("Content to write (markdown format)"),
      mode: z.enum(["append", "overwrite"]).optional().default("append").describe("Write mode"),
    },
  },
  async ({ path, content, mode }) => {
    await writeMemoryFile(path, content, mode);
    await reindexFile(path); // re-chunk, re-embed, update indexes
    return {
      content: [{ type: "text", text: `Written to ${path} and re-indexed.` }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("wrex-memory MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| sqlite-vss (Faiss-based) | sqlite-vec (pure C, no deps) | 2024 | Much easier to install, runs anywhere, npm package available |
| MCP SSE transport | MCP Streamable HTTP + stdio | 2025 (spec 2025-11-25) | SSE deprecated; stdio preferred for local tools |
| OpenAI embeddings API | Local GGUF models via llama.cpp | 2024-2025 | No API costs, no network dependency, privacy |
| Score normalization for hybrid search | Reciprocal Rank Fusion (RRF) | Well-established | More robust, no scale assumptions between systems |
| MCP Server class (low-level) | McpServer class (high-level) | MCP SDK ~1.x | registerTool() with Zod schemas is simpler than raw Server handlers |

**Deprecated/outdated:**
- **sqlite-vss:** Replaced by sqlite-vec. Do not use.
- **MCP SSE transport:** Deprecated per spec. Use stdio for local servers.
- **MCP Server (low-level class):** The high-level McpServer class with registerTool() is the current standard pattern.

## Open Questions

1. **Embedding batch size and memory usage**
   - What we know: node-llama-cpp's createEmbeddingContext accepts contextSize and batchSize options. nomic-embed-text-v1.5 is 0.1B parameters.
   - What's unclear: Optimal batch size for this model on typical dev hardware. Memory footprint at runtime.
   - Recommendation: Start with defaults, measure, tune. The model is small (140 MiB Q8_0) so memory should not be an issue.

2. **nomic-embed-text-v1.5 vs v2-moe for node-llama-cpp**
   - What we know: v2-moe is newer, better benchmarks, MoE architecture, larger (273-958 MiB). v1.5 is well-tested, smaller, simpler.
   - What's unclear: Whether node-llama-cpp v3.15 fully supports the v2-moe architecture (MoE embedding models are newer).
   - Recommendation: Start with v1.5 (proven, smaller). v2 can be a future upgrade if needed.

3. **FTS5 sync strategy: triggers vs application-level**
   - What we know: FTS5 external content tables can be synced via triggers or application code. There are known better-sqlite3 issues with FTS5 triggers in transactions using RETURNING clauses.
   - What's unclear: Whether triggers or application-level sync is more reliable in this specific stack.
   - Recommendation: Use application-level sync (insert into both tables in the same transaction) to avoid the trigger edge cases. Simpler to debug.

4. **MCP server process lifecycle**
   - What we know: Claude Code spawns MCP servers as child processes via stdio. The server runs as long as the Claude Code session.
   - What's unclear: Whether the MCP server should share the main app's database connection or have its own. How to handle model loading time on server startup.
   - Recommendation: The MCP server is a separate process with its own db connection and embedding context. Lazy-load the embedding model on first search (not on startup) to keep server startup fast.

5. **Re-indexing strategy after memory_write**
   - What we know: After writing to a memory file, the affected chunks need to be re-embedded and re-indexed.
   - What's unclear: Whether to re-index the entire file or only changed sections. How to handle concurrent writes.
   - Recommendation: Re-index the entire affected file (files are small markdown documents). Delete old chunks for that file, re-chunk, re-embed, re-insert. Wrap in a transaction for atomicity.

## Sources

### Primary (HIGH confidence)
- [node-llama-cpp embedding guide](https://node-llama-cpp.withcat.ai/guide/embedding) - API for getLlama, loadModel, createEmbeddingContext, getEmbeddingFor
- [node-llama-cpp downloading models](https://node-llama-cpp.withcat.ai/guide/downloading-models) - resolveModelFile, createModelDownloader, HuggingFace URI scheme
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) - vec0 virtual table CREATE/INSERT/MATCH syntax, metadata columns
- [sqlite-vec JS guide](https://alexgarcia.xyz/sqlite-vec/js.html) - better-sqlite3 integration, Float32Array buffer pattern
- [sqlite-vec metadata blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html) - Partition keys, auxiliary columns, metadata filtering
- [MCP build-server guide](https://modelcontextprotocol.io/docs/develop/build-server) - McpServer, StdioServerTransport, registerTool with Zod
- [MCP TypeScript SDK server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) - registerTool signature, tool handler return format
- [nomic-embed-text-v1.5 model card](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) - Task prefixes, dimensions, Matryoshka support
- [nomic-embed-text-v1.5 GGUF](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF) - Quantization options, file sizes, MSE comparisons
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp) - .mcp.json format, stdio configuration, scopes
- [SQLite FTS5 documentation](https://sqlite.org/fts5.html) - CREATE TABLE, MATCH, bm25 ranking

### Secondary (MEDIUM confidence)
- [RRF hybrid search - Azure AI Search](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking) - RRF formula, k=60 recommendation
- [RRF - Assembled blog](https://www.assembled.com/blog/better-rag-results-with-reciprocal-rank-fusion-and-hybrid-search) - Weighted RRF, practical implementation
- [Chunking strategies 2025 - Firecrawl](https://www.firecrawl.dev/blog/best-chunking-strategies-rag-2025) - Heading-aware chunking, 400-512 token recommendation
- [Chunking best practices - Weaviate](https://weaviate.io/blog/chunking-strategies-for-rag) - 10-20% overlap recommendation
- [better-sqlite3 FTS5 trigger issues](https://github.com/WiseLibs/better-sqlite3/issues/654) - Known issue with triggers + RETURNING

### Tertiary (LOW confidence)
- nomic-embed-text-v2-moe compatibility with node-llama-cpp - searched but not verified with official docs
- Optimal batch size for embedding context on typical hardware - no authoritative source found

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via official docs and npm; Phase 1 already uses better-sqlite3 + sqlite-vec
- Architecture: MEDIUM-HIGH - Patterns verified via official docs; chunking strategy based on well-documented RAG best practices
- Pitfalls: HIGH - Identified from official docs (MCP stdio logging), GitHub issues (better-sqlite3 + FTS5 triggers), and model cards (task prefixes)
- MCP integration: HIGH - Official SDK docs with complete TypeScript examples verified

**Research date:** 2026-02-12
**Valid until:** 2026-03-14 (30 days -- stack is stable, sqlite-vec is pre-v1 so watch for breaking changes)
