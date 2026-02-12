# Phase 3: Chat Experience - Context

**Gathered:** 2026-02-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Streaming chat UI with session management and memory-augmented conversations. Users can type messages, see Claude's responses stream in real-time with markdown rendering, manage multiple sessions via a sidebar, and see tool/memory usage. This is the end-to-end product surface.

Creating new memory tools or modifying the memory pipeline is out of scope — those exist from Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Chat Appearance
- Chat bubble style (user on right, Claude on left) with colored backgrounds
- Warm and friendly visual tone — rounded shapes, softer colors, approachable
- Dark mode based on user system settings (prefers-color-scheme)
- Different bubble colors distinguish user from Claude — no avatars or name labels
- Code blocks with full syntax highlighting and a copy button per block

### Streaming & Interaction
- Token-by-token streaming — each token appears as it arrives
- Auto-scroll stops once the top of the newest assistant message reaches the top of the chat viewport — no continued scrolling while user reads the growing message
- If user scrolls manually during streaming, all auto-scroll stops until the next message
- Stop button visible during streaming to abort the response
- User can type a new message while Claude is streaming — it queues and sends once the current response completes
- Errors appear inline in chat as a special bubble with a retry button
- Auto-expanding textarea input — single line that grows as you type, Enter to send, Shift+Enter for newline

### Session Sidebar
- Flat list, newest first — no date grouping headers
- Collapsible drawer that slides in/out — collapses to hamburger menu on narrow screens
- Auto-generated session titles from the first user message — no manual editing
- Each session item shows title + snippet of the last message
- "New chat" button at the top of the sidebar
- Clicking a past session loads full message history, input box ready to continue
- Instant session deletion — no confirmation dialog
- Empty state: blank chat area with input box ready — no welcome message or tips

### Tool & Memory Display
- Tool calls shown as collapsible blocks in the conversation flow
- Block appears with a spinner when tool starts executing, then shows results when done
- Collapsed by default — shows compact header (e.g., "Searched memory") that expands on click to reveal details
- Memory context injection shown as a visible system block at the start of the conversation — expandable to see what snippets were loaded

### Claude's Discretion
- Exact bubble colors and spacing
- Loading skeleton/indicator while waiting for first token
- Typography choices and font sizing
- How auto-generated titles are derived from first message
- Retry behavior on errors (how many times, backoff)
- Exact responsive breakpoints for sidebar collapse

</decisions>

<specifics>
## Specific Ideas

- Auto-scroll behavior is deliberate: scroll the new message into view, but once the top of the message hits the top of the viewport, stop. The user is reading — don't push content away from them.
- Message queue while streaming: don't disable the input, let users type ahead. Send when Claude finishes.
- Tool blocks should feel like GitHub's PR check blocks — compact, informative, expandable.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-chat-experience*
*Context gathered: 2026-02-12*
