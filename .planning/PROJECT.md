# Wrex

## What This Is

Wrex is a personal AI assistant that wraps Claude Code CLI in a web interface with persistent memory. It lets you chat with Claude through a browser while the agent retains knowledge across sessions using a searchable memory system backed by markdown files and semantic search. Built for a single user running on a dedicated VM.

## Core Value

A conversational AI assistant with persistent, searchable memory — so every session builds on everything that came before.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Web chat interface that streams Claude Code responses in real-time
- [ ] Session management (start new, resume, browse history)
- [ ] Persistent memory system with markdown files as source of truth
- [ ] Semantic search over memory using local embeddings (node-llama-cpp) + SQLite vector search
- [ ] Full-text keyword search over memory (FTS5 hybrid with vector search)
- [ ] Memory exposed as MCP server tools for Claude Code
- [ ] Claude Code integration via CLI headless mode with streaming
- [ ] Session history stored in SQLite
- [ ] Single-user, no authentication needed

### Out of Scope

- Multi-provider support — Claude only, via Claude Code CLI
- Docker/containerization — runs directly on VM
- Channel system (Slack, Discord, etc.) — web UI only
- Multi-user / authentication — single user on dedicated machine
- Mobile app — web-first
- OAuth / API key management UI — configured via environment

## Context

**Architecture:** TypeScript web server (TanStack Start with React) that spawns Claude Code CLI processes in headless mode (`claude -p --output-format stream-json --verbose --include-partial-messages`). The server captures streaming JSON events and forwards them to the browser via SSE or WebSocket.

**Memory system:** Inspired by openclaw's approach — markdown files (`MEMORY.md`, `memory/*.md`) are the source of truth. A SQLite database with sqlite-vec extension provides vector search (cosine similarity) and FTS5 provides keyword search. Hybrid search merges both results. Text is chunked (~400 tokens, 80 overlap) and embedded locally using node-llama-cpp with a GGUF model.

**Memory tools:** Exposed as an MCP server that Claude Code connects to, providing `memory_search` and `memory_get` tools. Additional hooks/skills can be added as needed.

**Claude Code integration:** Uses `--dangerously-skip-permissions` for autonomous operation. Sessions are managed via `--resume` with session IDs. The wrapper captures session IDs from JSON output to enable conversation continuity.

**UI:** TanStack Start (React meta-framework) with:
- Main chat panel with streaming message display
- "New Session" button
- Side panel with session history (clickable to revisit old sessions)

**Reference implementation:** openclaw project in `/workspaces/assistant/openclaw/` — memory management patterns adapted from there.

## Constraints

- **Provider**: Claude only, via Claude Code CLI subscription — no direct API calls
- **Embeddings**: Local only via node-llama-cpp — no external embedding API keys
- **Runtime**: Node.js/TypeScript — single language for server and tooling
- **Framework**: TanStack Start with React for web UI
- **Permissions**: Always runs with `--dangerously-skip-permissions`
- **Storage**: SQLite for both memory index and session history

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude Code CLI as backend | Leverages existing Claude Code subscription, no separate API costs | — Pending |
| Local embeddings only | No external API keys needed, runs on dedicated VM with resources | — Pending |
| SQLite for everything | Single database engine for memory index + session storage, simple ops | — Pending |
| TanStack Start | Modern React meta-framework, SSR capable, good DX | — Pending |
| MCP server for memory tools | Standard Claude Code extension mechanism, clean separation | — Pending |
| Hybrid search (vector + FTS5) | Best retrieval quality, matches openclaw's proven approach | — Pending |

---
*Last updated: 2026-02-12 after initialization*
