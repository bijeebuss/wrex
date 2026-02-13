---
status: testing
phase: 02-memory-pipeline
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md
started: 2026-02-12T21:00:00Z
updated: 2026-02-12T21:00:00Z
---

## Current Test

number: 1
name: Memory indexing pipeline
expected: |
  Run `npm run memory:index` in the project root.
  Should output a message confirming chunks were indexed from memory/MEMORY.md (expect 4+ chunks).
  No errors in output.
awaiting: user response

## Tests

### 1. Memory indexing pipeline
expected: Run `npm run memory:index` — indexes seed memory file, outputs chunk count (4+), no errors
result: [pending]

### 2. Hybrid search returns relevant results
expected: Run `npx tsx -e "import { hybridSearch } from './src/lib/memory/search.ts'; import { ensureTables } from './src/lib/memory/indexer.ts'; ensureTables(); hybridSearch('what is wrex architecture', 3).then(r => { r.forEach(x => console.log(x.heading, '| score:', x.score.toFixed(4), '| sources:', x.sources)); process.exit(0); })"` — returns 1-3 results with the Architecture-related chunk scoring highest, with score values and source attribution (vector/keyword/both)
result: [pending]

### 3. MCP server starts and lists tools
expected: Run `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | npx tsx src/mcp-server.ts 2>/dev/null` — returns a JSON-RPC response containing server capabilities. The server should start without errors (check stderr with `2>&1` if needed).
result: [pending]

### 4. memory_search returns formatted results
expected: After initializing the MCP server, send a tools/call for memory_search with query "sqlite". Should return formatted text with headings, file paths, line ranges, relevance scores, and content previews from the indexed memory file.
result: [pending]

### 5. memory_write persists and re-indexes
expected: Use the memory_write MCP tool to append content like "## Test Entry\nThis is a test of the memory write pipeline." to a new file (e.g., path "test-write.md"). Then search for "test entry" — the newly written content should appear in search results, confirming write + re-index works end-to-end.
result: [pending]

### 6. memory_get reads file with path safety
expected: Use memory_get to read memory/MEMORY.md (path: "MEMORY.md"). Should return the full file content. Also verify path traversal is blocked: requesting path "../package.json" should return an error message, not file contents.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0

## Gaps

[none yet]
