# Phase 3: Chat Experience - Research

**Researched:** 2026-02-12
**Domain:** Streaming chat UI, session management, memory-augmented conversations
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Chat Appearance
- Chat bubble style (user on right, Claude on left) with colored backgrounds
- Warm and friendly visual tone -- rounded shapes, softer colors, approachable
- Dark mode based on user system settings (prefers-color-scheme)
- Different bubble colors distinguish user from Claude -- no avatars or name labels
- Code blocks with full syntax highlighting and a copy button per block

#### Streaming & Interaction
- Token-by-token streaming -- each token appears as it arrives
- Auto-scroll stops once the top of the newest assistant message reaches the top of the chat viewport -- no continued scrolling while user reads the growing message
- If user scrolls manually during streaming, all auto-scroll stops until the next message
- Stop button visible during streaming to abort the response
- User can type a new message while Claude is streaming -- it queues and sends once the current response completes
- Errors appear inline in chat as a special bubble with a retry button
- Auto-expanding textarea input -- single line that grows as you type, Enter to send, Shift+Enter for newline

#### Session Sidebar
- Flat list, newest first -- no date grouping headers
- Collapsible drawer that slides in/out -- collapses to hamburger menu on narrow screens
- Auto-generated session titles from the first user message -- no manual editing
- Each session item shows title + snippet of the last message
- "New chat" button at the top of the sidebar
- Clicking a past session loads full message history, input box ready to continue
- Instant session deletion -- no confirmation dialog
- Empty state: blank chat area with input box ready -- no welcome message or tips

#### Tool & Memory Display
- Tool calls shown as collapsible blocks in the conversation flow
- Block appears with a spinner when tool starts executing, then shows results when done
- Collapsed by default -- shows compact header (e.g., "Searched memory") that expands on click to reveal details
- Memory context injection shown as a visible system block at the start of the conversation -- expandable to see what snippets were loaded

### Claude's Discretion
- Exact bubble colors and spacing
- Loading skeleton/indicator while waiting for first token
- Typography choices and font sizing
- How auto-generated titles are derived from first message
- Retry behavior on errors (how many times, backoff)
- Exact responsive breakpoints for sidebar collapse

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Summary

Phase 3 builds the end-to-end chat experience on top of the existing Phase 1 (Claude CLI process manager, SSE streaming endpoint, NDJSON parser) and Phase 2 (MCP memory server with hybrid search). The existing codebase already has a working `/api/chat` SSE endpoint that spawns Claude Code CLI with `--output-format stream-json --verbose --include-partial-messages`, parses NDJSON events, and forwards them as SSE to the browser. It also has a working `index.tsx` with basic prompt/response UI and a SQLite database with `sessions` and `messages` tables.

The work breaks into three areas: (1) replacing the basic index.tsx with a proper chat bubble UI featuring streaming markdown rendering, auto-scroll, tool visibility blocks, and a proper input component; (2) adding session management with a sidebar, route-based session selection, and server functions for CRUD operations; (3) wiring memory context injection via `--append-system-prompt` and `--mcp-config` flags on the Claude CLI process, plus displaying injected memory context in the UI.

**Primary recommendation:** Use Tailwind CSS v4 with the Vite plugin for styling, streamdown for streaming markdown rendering (handles incomplete markdown gracefully during token streaming), `react-textarea-autosize` for the auto-expanding input, TanStack Router file-based routes with a `_chat` pathless layout route for the sidebar layout, and `createServerFn` for session CRUD operations. Inject memory context via the `--append-system-prompt` CLI flag and pass the MCP config via `--mcp-config`.

## Existing Codebase State

Understanding the existing code is critical for planning. Here is what Phase 1 and Phase 2 already built:

### Server-Side (already built)
| Component | File | What It Does |
|-----------|------|-------------|
| SSE endpoint | `src/server.tsx` | Routes `POST /api/chat` to `handleChatRequest`, everything else to TanStack Start SSR |
| Chat handler | `src/lib/claude/chat-handler.ts` | Validates request, creates session/message records in DB, spawns Claude CLI, streams NDJSON as SSE, saves result |
| Process manager | `src/lib/claude/process-manager.ts` | Singleton that spawns Claude CLI with correct flags, tracks active processes, handles cleanup |
| NDJSON parser | `src/lib/claude/ndjson-parser.ts` | Buffer-based line parser for Claude CLI stdout |
| Event types | `src/lib/claude/types.ts` | TypeScript interfaces for all NDJSON events: `SystemEvent`, `StreamEvent`, `AssistantEvent`, `ResultEvent` |
| DB schema | `src/lib/db/schema.ts` | `sessions` (id, claudeSessionId, title, status, timestamps), `messages` (id, sessionId, role, content, toolUse, cost/tokens/duration, timestamps), `memoryChunks` |
| DB connection | `src/lib/db/index.ts` | better-sqlite3 + Drizzle ORM + sqlite-vec extension |
| MCP server | `src/mcp-server.ts` | stdio-based MCP server with `memory_search`, `memory_get`, `memory_write` tools |
| Memory search | `src/lib/memory/search.ts` | Hybrid vector + FTS5 search with RRF scoring |
| Memory embedder | `src/lib/memory/embedder.ts` | Singleton nomic-embed-text-v1.5 via node-llama-cpp |

### Client-Side (minimal, needs replacement)
| Component | File | What It Does |
|-----------|------|-------------|
| Root route | `src/routes/__root.tsx` | HTML shell with `<HeadContent>` and `<Outlet>`, links global.css |
| Index page | `src/routes/index.tsx` | Single-page prompt/response UI with basic SSE consumption, no markdown rendering |
| Global CSS | `src/styles/global.css` | Minimal reset, dark background (#1a1a2e), sans-serif font |

### CLI Flags Already Used
The process manager spawns Claude with: `-p <prompt>`, `--output-format stream-json`, `--verbose`, `--include-partial-messages`, `--dangerously-skip-permissions`, and optionally `--resume <sessionId>`.

### What Needs to Change
1. **Process manager**: Add `--append-system-prompt`, `--mcp-config` flags for memory injection
2. **Chat handler**: Forward tool_use events to client (already forwarding all events), add API endpoints for session listing/deletion, enhance to show memory context
3. **Routes**: Replace single index.tsx with layout route + session-based routing
4. **UI**: Complete rewrite of the client-side rendering

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| streamdown | ^2.2.0 | Streaming markdown rendering | Purpose-built for AI streaming; handles incomplete markdown, unterminated code blocks; built-in Shiki syntax highlighting with copy button; maintained by Vercel |
| @streamdown/code | ^2.2.0 | Syntax highlighting plugin for streamdown | Shiki-powered, 200+ languages, lazy-loaded, copy button built-in, disable during stream |
| @tailwindcss/vite | ^4.x | CSS utility framework (Vite plugin) | Required by streamdown for styling; v4 has zero-config Vite plugin; CSS variables for theming |
| tailwindcss | ^4.x | CSS framework | Streamdown requires Tailwind for its styling system |
| react-textarea-autosize | ^8.5.9 | Auto-expanding textarea | 1.3KB, drop-in textarea replacement, handles resize on content change |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clsx | ^2.x | Conditional CSS class joining | Combining Tailwind classes conditionally |
| zod | ^3.24.0 | Schema validation (already installed) | Validating server function inputs |

### Why Streamdown Over react-markdown

The project needs to render markdown that streams token-by-token. Standard `react-markdown` does not handle incomplete markdown gracefully -- mid-stream, you get broken bold text, unclosed code blocks, and malformed links. Streamdown was purpose-built for this exact problem:

1. **Incomplete markdown handling**: Uses `remend` parser to close unterminated blocks during streaming
2. **Built-in code features**: Shiki syntax highlighting with copy button that auto-disables during streaming
3. **Streaming-aware rendering**: `isAnimating` prop controls behavior during active streams
4. **Memoized rendering**: Efficient re-renders as tokens arrive

The tradeoff is that streamdown requires Tailwind CSS, which the project does not currently use. However, Tailwind v4's Vite plugin is zero-config (`npm i @tailwindcss/vite`, add plugin to vite.config.ts, add `@import "tailwindcss"` to CSS). This is a net positive -- Tailwind will also simplify the chat bubble styling, sidebar layout, responsive breakpoints, and dark mode implementation.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| streamdown | react-markdown + rehype-highlight | Would need custom incomplete-markdown handling, manual copy button, no streaming optimizations. More work, worse streaming UX |
| Tailwind CSS | Plain CSS / CSS Modules | Would lose streamdown compatibility. Possible but requires forking/patching streamdown styles |
| react-textarea-autosize | CSS grid trick | CSS-only auto-resize exists but lacks maxRows cap, cross-browser edge cases, and React integration |

**Installation:**
```bash
npm install streamdown @streamdown/code @tailwindcss/vite tailwindcss react-textarea-autosize clsx
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── routes/
│   ├── __root.tsx              # HTML shell, global providers, dark mode
│   ├── _chat.tsx               # Pathless layout: sidebar + chat area (Outlet)
│   ├── _chat.index.tsx         # Empty state: new chat (no session selected)
│   └── _chat.$sessionId.tsx    # Active chat session (loads history, streams)
├── components/
│   ├── chat/
│   │   ├── ChatMessage.tsx     # Single message bubble (user or assistant)
│   │   ├── ChatInput.tsx       # Auto-expanding textarea with send/stop
│   │   ├── ChatMessages.tsx    # Scrollable message list with auto-scroll
│   │   ├── ToolBlock.tsx       # Collapsible tool-use block
│   │   ├── MemoryContext.tsx   # Expandable memory injection block
│   │   └── ErrorBubble.tsx     # Error message with retry button
│   ├── sidebar/
│   │   ├── Sidebar.tsx         # Session list drawer
│   │   ├── SessionItem.tsx     # Single session entry
│   │   └── NewChatButton.tsx   # "New chat" button
│   └── ui/
│       └── LoadingIndicator.tsx # Thinking/loading animation
├── hooks/
│   ├── useChat.ts              # SSE streaming, message accumulation, queue
│   ├── useAutoScroll.ts        # Smart auto-scroll with manual override
│   ├── useSidebar.ts           # Sidebar open/close state
│   └── useDarkMode.ts          # prefers-color-scheme detection
├── lib/
│   ├── claude/                 # (existing) process manager, chat handler, etc.
│   ├── db/                     # (existing) schema, connection
│   ├── memory/                 # (existing) search, embedder, indexer
│   └── api/
│       └── sessions.ts         # createServerFn for session CRUD
├── types/
│   └── chat.ts                 # Shared UI types (Message, Session, etc.)
└── styles/
    └── global.css              # Tailwind import + CSS variables + streamdown styles
```

### Pattern 1: Pathless Layout Route for Sidebar
**What:** A `_chat.tsx` pathless layout route that renders the sidebar and an `<Outlet>` for the active chat content. All chat routes nest under this layout without adding a URL segment.
**When to use:** When you need a persistent sidebar across all chat views (empty state, active session).
**Example:**
```typescript
// src/routes/_chat.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Sidebar } from '@/components/sidebar/Sidebar'

export const Route = createFileRoute('/_chat')({
  component: ChatLayout,
})

function ChatLayout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
```

### Pattern 2: SSE Streaming Hook with Message Queue
**What:** A `useChat` hook that manages SSE connection, accumulates tokens into messages, handles message queuing while streaming, and exposes state for the UI.
**When to use:** In every chat view component.
**Example:**
```typescript
// src/hooks/useChat.ts (simplified)
interface UseChatOptions {
  sessionId?: string
  onSessionCreated?: (id: string) => void
}

interface UseChatReturn {
  messages: ChatMessage[]
  status: 'idle' | 'streaming' | 'done' | 'error'
  error: string | null
  sendMessage: (text: string) => void
  stopStreaming: () => void
  retryLast: () => void
  memoryContext: MemorySnippet[] | null
  activeToolCalls: ToolCallState[]
}

function useChat(opts: UseChatOptions): UseChatReturn {
  // 1. Maintain message array in state
  // 2. On sendMessage: if streaming, queue; otherwise POST to /api/chat
  // 3. Parse SSE events: accumulate text_delta into current assistant message
  // 4. Track tool_use content blocks (content_block_start with type=tool_use)
  // 5. On content_block_stop for tool_use: mark tool as complete
  // 6. On result event: finalize, check queue, send next if present
  // 7. On error: set error state, expose retryLast
}
```

### Pattern 3: Smart Auto-Scroll with Intersection Observer
**What:** Auto-scroll that stops when the top of the newest assistant message reaches the top of the viewport, and respects manual scroll.
**When to use:** In the message list container.
**Key behavior:**
1. When a new assistant message starts, scroll it into view
2. Track the top edge of the latest assistant message with IntersectionObserver
3. Once the top edge hits the viewport top, stop auto-scrolling
4. If user scrolls manually during streaming, disable auto-scroll until next message
5. Show "scroll to bottom" button when not at bottom

```typescript
// src/hooks/useAutoScroll.ts (concept)
function useAutoScroll(messagesRef: RefObject<HTMLDivElement>) {
  const [isAutoScrolling, setIsAutoScrolling] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const latestMessageTopRef = useRef<HTMLDivElement>(null)

  // IntersectionObserver on latest message top edge
  // When intersecting (visible at top) -> stop auto-scroll
  // Scroll event listener -> if user scrolls up, disable auto-scroll
  // New message arrival -> re-enable auto-scroll, scroll new message into view

  return { isAutoScrolling, showScrollButton, scrollToBottom, latestMessageTopRef }
}
```

### Pattern 4: Tool Call State Machine in Streaming
**What:** Track tool calls through their lifecycle: starting -> executing -> complete, using NDJSON events.
**When to use:** For rendering collapsible tool blocks with spinners.
**Event sequence for a tool call:**
1. `stream_event` with `content_block_start` + `content_block.type === 'tool_use'` -> tool call starting (capture name, id)
2. `stream_event` with `content_block_delta` + `delta.type === 'input_json_delta'` -> tool input streaming
3. `stream_event` with `content_block_stop` -> tool input complete, tool executing
4. After Claude processes tool result internally, next text/tool content block begins
5. `assistant` event has complete `content` array with all tool_use blocks for post-stream rendering

**Important note about Claude CLI tool execution:** When Claude Code CLI executes MCP tools, the tool execution happens inside the CLI process. The NDJSON stream shows `content_block_start` with `type: 'tool_use'` when Claude decides to call a tool, followed by `input_json_delta` for the tool input. After `content_block_stop`, the CLI executes the tool internally. The next `message_start` / content blocks represent Claude's response after seeing the tool result. The `parent_tool_use_id` field on stream events can be used to associate responses with their parent tool calls.

### Pattern 5: Server Functions for Session CRUD
**What:** Use TanStack Start's `createServerFn` for session listing, deletion, and title generation.
**When to use:** For sidebar data loading and actions.
```typescript
// src/lib/api/sessions.ts
import { createServerFn } from '@tanstack/react-start'
import { db } from '@/lib/db'
import { sessions, messages } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'

export const listSessions = createServerFn({ method: 'GET' })
  .handler(async () => {
    return db.query.sessions.findMany({
      orderBy: desc(sessions.updatedAt),
      with: {
        messages: {
          limit: 1,
          orderBy: desc(messages.createdAt),
        },
      },
    }).sync()
  })

export const deleteSession = createServerFn({ method: 'POST' })
  .validator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    db.delete(sessions).where(eq(sessions.id, data.sessionId)).run()
    return { success: true }
  })
```

### Pattern 6: Memory Context Injection
**What:** Before spawning Claude CLI, search memory for relevant context based on the user's message, then inject it via `--append-system-prompt`.
**When to use:** On every new message to a session.
```typescript
// In chat-handler.ts, before spawning:
const memoryResults = await hybridSearch(prompt, 3)
let systemPromptAppend = ''
if (memoryResults.length > 0) {
  const contextSnippets = memoryResults.map(r =>
    `[${r.filePath}:${r.startLine}-${r.endLine}]\n${r.content}`
  ).join('\n\n---\n\n')
  systemPromptAppend = `\n\nRelevant memory context:\n${contextSnippets}`
}

// Pass to process manager
child = processManager.spawn(sessionId, prompt, {
  resumeSessionId: claudeResumeSessionId,
  appendSystemPrompt: systemPromptAppend,
  mcpConfigPath: path.resolve('.mcp.json'),
})
```

### Anti-Patterns to Avoid
- **Re-parsing all markdown on every token:** Use streamdown's memoized rendering, not raw react-markdown re-renders
- **Storing streaming state in URL params:** Session ID goes in the URL, but streaming state (current message buffer) stays in component state
- **Blocking input during streaming:** The user decision explicitly says users should be able to type ahead while streaming -- queue messages, don't disable input
- **Polling for session updates:** Use the SSE stream for real-time updates, server functions only for initial data loading
- **Using scrollIntoView without nuance:** The auto-scroll spec requires stopping when the message top reaches viewport top, not just "always scroll to bottom"

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming markdown | Custom regex to close unclosed blocks | streamdown | Handles 20+ markdown edge cases during streaming; battle-tested by Vercel |
| Syntax highlighting | Custom highlight.js integration | @streamdown/code (Shiki) | VS Code-accurate highlighting, 200+ languages, lazy-loaded, copy button built-in |
| Auto-expanding textarea | CSS-only grid trick or manual resize | react-textarea-autosize | Cross-browser, handles paste, maxRows, 1.3KB |
| Dark mode detection | Manual matchMedia polling | CSS `prefers-color-scheme` + Tailwind `dark:` variant | Zero JS for basic detection; Tailwind v4 supports `@media (prefers-color-scheme: dark)` natively via `dark:` classes |
| SSE parsing | Manual text/event-stream parser | Existing `sseBuffer` pattern from index.tsx | Already working and tested; just needs extraction into a hook |

**Key insight:** The streaming markdown problem is deceptively hard. Token-by-token rendering creates states like `**bold text without closing`, `` ```code without closing ```, and `[link text without](`. Streamdown exists specifically because this problem is complex enough that every AI chat product was solving it independently.

## Common Pitfalls

### Pitfall 1: Markdown Re-render Thrashing
**What goes wrong:** Every new token causes the entire markdown tree to re-parse and re-render, causing visible flicker and dropped frames.
**Why it happens:** Naive approach: `setContent(prev => prev + token)` -> full react-markdown re-render on every state update.
**How to avoid:** Streamdown uses memoized rendering internally. Additionally, use `React.memo` on message components so only the actively-streaming message re-renders. Consider batching rapid token updates with `requestAnimationFrame`.
**Warning signs:** Visible text flicker during fast streaming, browser becoming sluggish during long responses.

### Pitfall 2: Auto-Scroll Fighting User Scroll
**What goes wrong:** User tries to read a long response, but auto-scroll keeps pushing content down.
**Why it happens:** Scroll-to-bottom logic runs on every token, overriding user scroll position.
**How to avoid:** Implement the two-phase approach: (1) On new message, scroll message top into view once. (2) Use IntersectionObserver on message top -- once it exits viewport top, stop scrolling. (3) On manual scroll event, set `userHasScrolled = true` and stop until next message.
**Warning signs:** Users complaining they can't read long responses, scroll position jumping.

### Pitfall 3: Message Queue Race Conditions
**What goes wrong:** User types a message while streaming, it sends immediately and creates concurrent Claude processes for the same session.
**Why it happens:** No queue mechanism; send fires immediately regardless of stream state.
**How to avoid:** The `useChat` hook must maintain a queue. When `status === 'streaming'`, push to queue. On stream completion, check queue and send next. Only one active stream per session.
**Warning signs:** Overlapping SSE connections, garbled responses, Claude process leaks.

### Pitfall 4: SSE Connection Cleanup on Route Change
**What goes wrong:** User navigates away from a chat session while streaming -- SSE connection stays open, Claude process keeps running.
**Why it happens:** Missing cleanup in useEffect return, or AbortController not wired to navigation.
**How to avoid:** In `useChat` hook: return cleanup function that calls `controller.abort()`. The server-side `cancel()` handler in the ReadableStream already kills the Claude process when the client disconnects. Also ensure route changes trigger component unmount (TanStack Router does this by default).
**Warning signs:** Zombie Claude processes, browser tab using resources after navigating away.

### Pitfall 5: Session Title Generation Timing
**What goes wrong:** Session appears in sidebar with no title because title generation happens too late or fails.
**Why it happens:** Title must be derived from first user message, but creating it during streaming adds complexity.
**How to avoid:** Generate title immediately when first user message is sent (simple approach: first N characters of first message). Update in DB synchronously before SSE stream starts. The session already exists in DB at that point.
**Warning signs:** Sidebar showing empty titles, "undefined" text.

### Pitfall 6: Tailwind CSS Not Scanning Streamdown
**What goes wrong:** Streamdown components render but have no styles -- unstyled HTML.
**Why it happens:** Tailwind v4 needs to know about streamdown's source files to include its utility classes.
**How to avoid:** Add `@source "../node_modules/streamdown/dist/*.js"` to global.css after the `@import "tailwindcss"` line. This tells Tailwind to scan streamdown's compiled output for class names.
**Warning signs:** Streamdown components rendering as plain unstyled HTML.

### Pitfall 7: `prefers-color-scheme` Flicker on SSR
**What goes wrong:** Page renders in light mode during SSR, then flashes to dark mode on hydration.
**Why it happens:** Server doesn't know user's color scheme preference; it defaults to one, then client JS detects and switches.
**How to avoid:** Use `<meta name="color-scheme" content="light dark">` in `<head>` and Tailwind's `dark:` variant which uses CSS media queries (no JS flash). The `color-scheme` meta tag tells the browser to handle form controls and scrollbars natively. Avoid JS-based theme detection for the initial render.
**Warning signs:** Brief flash of wrong color scheme on page load.

## Code Examples

### Tailwind v4 Setup with Vite
```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tsconfigPaths(), tailwindcss(), tanstackStart()],
})
```

```css
/* src/styles/global.css */
@import "tailwindcss";
@source "../node_modules/streamdown/dist/*.js";

/* Import streamdown's animation styles */
@import "streamdown/styles.css";

/* Custom CSS variables for chat theming */
@theme {
  --color-user-bubble: #3b4a6b;
  --color-claude-bubble: #2d3748;
  --color-user-bubble-light: #e8f0fe;
  --color-claude-bubble-light: #f0f4f8;
}
```

### Dark Mode with prefers-color-scheme
```typescript
// In __root.tsx <head>
head: () => ({
  meta: [
    { charSet: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'color-scheme', content: 'light dark' },
    { title: 'Wrex' },
  ],
  links: [
    { rel: 'stylesheet', href: '/src/styles/global.css' },
  ],
})
```

Tailwind v4 `dark:` variant uses `@media (prefers-color-scheme: dark)` by default, so no JS is needed:
```tsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  {/* Content */}
</div>
```

### Streamdown Usage for Chat Message
```typescript
// src/components/chat/ChatMessage.tsx
import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import 'streamdown/styles.css'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-[var(--color-user-bubble)] dark:bg-[var(--color-user-bubble)] text-white">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-[var(--color-claude-bubble)] dark:bg-[var(--color-claude-bubble)]">
        <Streamdown
          plugins={{ code }}
          isAnimating={isStreaming}
        >
          {content}
        </Streamdown>
      </div>
    </div>
  )
}
```

### Process Manager Enhancement for Memory Injection
```typescript
// Updated spawn method signature in process-manager.ts
spawn(
  sessionId: string,
  prompt: string,
  opts?: {
    resumeSessionId?: string
    appendSystemPrompt?: string
    mcpConfigPath?: string
  },
): ChildProcess {
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--dangerously-skip-permissions',
  ]

  if (opts?.resumeSessionId) {
    args.push('--resume', opts.resumeSessionId)
  }

  if (opts?.appendSystemPrompt) {
    args.push('--append-system-prompt', opts.appendSystemPrompt)
  }

  if (opts?.mcpConfigPath) {
    args.push('--mcp-config', opts.mcpConfigPath)
  }

  // ... rest of spawn logic
}
```

### SSE Hook Pattern
```typescript
// src/hooks/useChat.ts (core pattern)
function useChat({ sessionId, onSessionCreated }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallState[]>([])
  const queueRef = useRef<string[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    if (status === 'streaming') {
      queueRef.current.push(text)
      // Add user message to UI immediately
      setMessages(prev => [...prev, { role: 'user', content: text }])
      return
    }

    setMessages(prev => [...prev, { role: 'user', content: text }])
    await startStream(text)
  }, [status, sessionId])

  const startStream = useCallback(async (text: string) => {
    setStatus('streaming')
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller

    // Add empty assistant message to accumulate into
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, sessionId }),
        signal: controller.signal,
      })

      // ... SSE parsing (similar to existing index.tsx pattern)
      // On text_delta: append to last assistant message
      // On content_block_start with tool_use: add to activeToolCalls
      // On content_block_stop for tool_use: mark tool complete
      // On result: finalize, check queue, send next
      // On error: set error state
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message)
        setStatus('error')
      }
    }
  }, [sessionId])

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  return { messages, status, error, sendMessage, stopStreaming, retryLast, activeToolCalls }
}
```

### TanStack Router File Structure
```typescript
// src/routes/_chat.tsx - Layout with sidebar
export const Route = createFileRoute('/_chat')({
  component: ChatLayout,
  loader: () => listSessions(),  // Load sessions for sidebar
})

// src/routes/_chat.index.tsx - Empty/new chat state
export const Route = createFileRoute('/_chat/')({
  component: NewChat,
})

// src/routes/_chat.$sessionId.tsx - Active session
export const Route = createFileRoute('/_chat/$sessionId')({
  component: ChatSession,
  loader: ({ params }) => loadSessionMessages({ sessionId: params.sessionId }),
})
```

### Auto-Generated Session Title
**Recommendation:** Extract the first 50 characters of the first user message, trimmed to the last complete word. Simple, predictable, no AI cost.
```typescript
function generateTitle(firstMessage: string): string {
  const maxLen = 50
  if (firstMessage.length <= maxLen) return firstMessage
  const trimmed = firstMessage.slice(0, maxLen)
  const lastSpace = trimmed.lastIndexOf(' ')
  return (lastSpace > 20 ? trimmed.slice(0, lastSpace) : trimmed) + '...'
}
```

### Retry Behavior Recommendation
**Recommendation:** Exponential backoff with 3 attempts maximum.
- Attempt 1: immediate
- Attempt 2: after 1 second
- Attempt 3: after 3 seconds
- After 3 failures: show permanent error bubble with manual retry button

### Loading Indicator Recommendation
**Recommendation:** Three animated dots (pulsing opacity) inside an assistant bubble placeholder. Appears immediately after user sends a message, before first token arrives. Disappears when first token renders.

### Typography Recommendation
**Recommendation:** Use the system font stack already in global.css. Set base font size to 15px for chat messages (slightly larger than standard 14px for readability in a chat context). Code blocks at 13px monospace.

### Responsive Breakpoints Recommendation
**Recommendation:**
- `>= 768px` (md): Sidebar visible as persistent drawer, 280px wide
- `< 768px` (sm): Sidebar hidden, hamburger menu button in top-left, sidebar slides in as overlay

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-markdown for streaming AI | streamdown (Vercel) | Feb 2026 | Purpose-built streaming markdown with memoization, handles incomplete blocks |
| highlight.js / Prism.js | Shiki (VS Code TextMate grammars) | 2024-2025 | Accurate highlighting, lazy-loaded, theme ecosystem |
| Tailwind v3 (PostCSS + config file) | Tailwind v4 (Vite plugin, CSS-first) | Jan 2025 | Zero config, `@import "tailwindcss"`, 5x faster builds |
| Manual dark mode toggle | `prefers-color-scheme` + CSS `color-scheme` | 2024+ | No JS flash, respects system setting, simpler implementation |
| Custom SSE parsers | Established SSE + NDJSON patterns | Stable | Project already has a working pattern in index.tsx |

**Deprecated/outdated:**
- `react-markdown` for streaming: Still works but not optimized for AI streaming. Streamdown is the successor for this use case.
- Tailwind v3 config-based setup: v4 is CSS-first, no `tailwind.config.js` needed.
- Manual `window.matchMedia` for dark mode: CSS media queries via Tailwind `dark:` variant handle this without JS.

## Open Questions

1. **Streamdown + React 19.0 compatibility**
   - What we know: Streamdown docs say "React >= 19.1.1" as minimum, but also claim "backward compatibility to React 18+". The project uses React ^19.0.0.
   - What's unclear: Whether React 19.0.x works without issues, or if 19.1.1 is truly required.
   - Recommendation: Test during implementation. If incompatible, upgrade React to ^19.1.1 (minor version bump, should be safe). The `^19.0.0` range in package.json already permits 19.1.1.

2. **Streamdown bundle size with Tailwind**
   - What we know: @streamdown/code full bundle is ~1.2MB gz, but uses lazy-loading for languages. Tailwind v4 tree-shakes unused utilities.
   - What's unclear: Actual production bundle impact in this project.
   - Recommendation: Measure after integration. If too large, streamdown supports a minimal core bundle option.

3. **Claude CLI `--mcp-config` with `--resume`**
   - What we know: Both flags exist and are documented. The existing code already uses `--resume`.
   - What's unclear: Whether MCP config is automatically carried across resumed sessions, or needs to be re-specified.
   - Recommendation: Always pass `--mcp-config` on every spawn, even when resuming. Safe and explicit.

4. **Tool result visibility in NDJSON stream**
   - What we know: `content_block_start` with `tool_use` shows tool name and ID. `input_json_delta` streams the input. Claude CLI executes tools internally.
   - What's unclear: Whether the tool *result* (e.g., memory search results) appears in the NDJSON stream as a distinct event, or only as part of Claude's subsequent text response.
   - Recommendation: During implementation, log all NDJSON events when a memory tool is called to map the exact event sequence. The `assistant` event includes full content arrays, which should contain tool_use blocks. The tool result may appear as a `user` type event with tool_result content, or may be internal to the CLI. Design the UI to show what's available.

## Sources

### Primary (HIGH confidence)
- Claude Code CLI reference: https://code.claude.com/docs/en/cli-reference -- All CLI flags verified including `--append-system-prompt`, `--mcp-config`, `--strict-mcp-config`
- Claude API streaming docs: https://platform.claude.com/docs/en/build-with-claude/streaming -- Complete event sequence for tool_use streaming
- Streamdown official docs: https://streamdown.ai/docs/usage, https://streamdown.ai/docs/code-blocks, https://streamdown.ai/docs/styling -- API, plugins, theming
- Streamdown GitHub: https://github.com/vercel/streamdown -- Version 2.2.0 (Feb 9, 2026), README
- TanStack Router file-based routing: https://tanstack.com/router/v1/docs/framework/react/routing/file-naming-conventions -- Pathless layouts, dynamic params
- TanStack Start server functions: https://tanstack.com/start/latest/docs/framework/react/guide/server-functions -- createServerFn API

### Secondary (MEDIUM confidence)
- Tailwind CSS v4 Vite setup: https://tailwindcss.com/docs/installation/using-vite -- Zero-config Vite plugin
- react-textarea-autosize: https://github.com/Andarist/react-textarea-autosize -- v8.5.9, React compatibility
- Auto-scroll patterns: https://davelage.com/posts/chat-scroll-react/, https://tuffstuff9.hashnode.dev/intuitive-scrolling-for-chatbot-message-streaming

### Tertiary (LOW confidence)
- Streamdown React 19.0 vs 19.1.1 compatibility: Conflicting information in docs ("18+ backward compatible" vs "19.1.1 minimum"). Needs validation during implementation.
- Tool result NDJSON event format: Not fully documented for Claude Code CLI's `--output-format stream-json`. Needs empirical testing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - streamdown is well-documented, Tailwind v4 is stable, existing codebase patterns are clear
- Architecture: HIGH - TanStack Router pathless layouts, server functions, and hook patterns are well-documented
- Pitfalls: HIGH - Most pitfalls are from direct streaming AI chat experience; auto-scroll and queue patterns are well-understood
- Memory integration: MEDIUM - `--append-system-prompt` and `--mcp-config` flags verified, but exact NDJSON event flow for MCP tool results needs empirical testing

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days -- stack is stable, streamdown actively maintained)
