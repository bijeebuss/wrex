# Wrex Memory

## Project Overview
Wrex is a personal AI assistant with persistent memory. It wraps Claude Code CLI in a web interface and uses a searchable memory system backed by markdown files and semantic search.

## Architecture
The system uses TanStack Start with React for the web UI, better-sqlite3 with sqlite-vec for vector search, and node-llama-cpp for local embeddings. The MCP server exposes memory tools to Claude Code.

## Key Decisions
- Local embeddings only via node-llama-cpp (no external API keys)
- SQLite for everything (memory index + session storage)
- Hybrid search combining vector similarity and FTS5 keyword search
