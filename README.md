# Wrex

A personal AI assistant with persistent memory, built as a web UI on top of [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Wrex remembers your conversations, preferences, and context across sessions using a hybrid search system (vector similarity + full-text keyword search) backed by SQLite.

## Prerequisites

- **Node.js** >= 22
- **Claude Code CLI** >= 2.1 — installed and authenticated (`claude --version` to verify)
- An active **Anthropic API key** or Claude subscription configured in the CLI

### Installing Claude Code CLI

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

Then authenticate:

```sh
claude login
```

## Setup

```sh
# Install dependencies
npm install

# Pull the embedding model (nomic-embed-text, ~130MB, used for memory search)
npm run models:pull

# Push the database schema (creates data/wrex.db)
npm run db:push
```

## Running

```sh
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

The app runs at **http://localhost:55520**.

## How It Works

### Architecture

```
Browser (React + TanStack Router)
   │
   ├── POST /api/chat ──→ SSE stream ──→ Claude Code CLI (spawned per message)
   │                                         │
   │                                         ├── MCP tools (memory_search, memory_write, ...)
   │                                         └── Built-in tools (Read, Write, Edit, Bash, ...)
   │
   ├── GET /api/mcp ────→ HTTP MCP server (memory tools)
   │
   └── SSR pages ───────→ TanStack Start (server-rendered React)

SQLite (data/wrex.db)
   ├── sessions & messages (chat history)
   ├── memory_chunks (indexed markdown sections)
   ├── vec_memory_chunks (sqlite-vec embeddings)
   └── fts_memory_chunks (FTS5 full-text index)
```

### Chat Flow

1. User sends a message through the web UI
2. Server searches memory for relevant context and injects it into the system prompt
3. Server spawns a `claude` CLI process with `--output-format stream-json`
4. NDJSON events stream back through SSE to the browser
5. User and assistant messages are persisted to SQLite
6. Claude can use MCP tools to read/write/search memory during the conversation

### Memory System

Wrex has a persistent memory system stored as markdown files in `data/workspace/memory/`. Memories are:

- **Chunked** by markdown headings (H1-H4 boundaries)
- **Embedded** using nomic-embed-text (local GGUF model via node-llama-cpp)
- **Indexed** in both a vector table (sqlite-vec) and a full-text table (FTS5)
- **Searched** using hybrid Reciprocal Rank Fusion (RRF) combining both indexes

MCP tools available to the assistant:

| Tool | Description |
|---|---|
| `memory_search` | Natural language search across all memories |
| `memory_get` | Read a specific memory file |
| `memory_write` | Write/append to a memory file and re-index |
| `memory_list` | List memory files with metadata |
| `memory_reindex` | Re-index files after manual edits |

### Workspace

The assistant operates in `data/workspace/` which is created automatically on first startup. This directory contains:

```
data/workspace/
├── .claude/CLAUDE.md   # Workspace conventions (auto-seeded)
├── memory/             # Persistent memory files
└── SOUL.md             # (optional) Personality override
```

## Dev Container

The repo includes a `.devcontainer/` config for VS Code / GitHub Codespaces. It:

- Uses the Node.js 22 TypeScript dev container image
- Installs Claude Code CLI in the container
- Mounts `~/.claude-linux` and `~/.claude-linux.json` from the host for CLI authentication
- Forwards port 55520

To use it, create the auth files on your host before opening in the container:

```sh
# Copy your Claude config to the expected mount paths
cp -r ~/.claude ~/.claude-linux
cp ~/.claude.json ~/.claude-linux.json
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Build for production |
| `npm start` | Run production build |
| `npm run db:push` | Push schema to SQLite |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |
| `npm run models:pull` | Download the embedding model |
| `npm run memory:index` | Manually re-index all memory files |
| `npm run memory:clear` | Clear all memory data from the database |
| `npm run mcp:dev` | Run MCP server in stdio mode (for direct CLI use) |

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `DB_PATH` | `./data/wrex.db` | SQLite database file path |
| `MEMORY_DIR` | `./data/workspace/memory` | Memory files directory |

## Tech Stack

- **Frontend**: React 19, TanStack Router/Start, Tailwind CSS 4, Streamdown (markdown rendering)
- **Backend**: Vite 7 SSR, Drizzle ORM, better-sqlite3
- **AI**: Claude Code CLI (subprocess), nomic-embed-text (local embeddings)
- **Search**: sqlite-vec (vector KNN), FTS5 (keyword), RRF fusion
- **MCP**: Model Context Protocol server (HTTP + stdio transports)
