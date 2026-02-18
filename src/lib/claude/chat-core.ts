/**
 * Transport-agnostic chat orchestration.
 *
 * Encapsulates the full lifecycle of a chat request:
 * session create/get, user message insert, memory search, system prompt,
 * Claude process spawn, NDJSON parsing, text accumulation, and DB persistence.
 *
 * Used by both the SSE handler (web) and WebSocket handler (mobile).
 */
import path from 'node:path'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/index'
import { sessions, messages } from '@/lib/db/schema'
import { processManager } from '@/lib/claude/process-manager'
import { parseNDJSON } from '@/lib/claude/ndjson-parser'
import { hybridSearch } from '@/lib/memory/search'
import { buildSystemPrompt } from '@/lib/claude/system-prompt'
import { hasMemories } from '@/lib/workspace/init'
import { getBuiltinMcpConfig } from '@/lib/claude/mcp-config'
import type { ClaudeEvent, SystemEvent, StreamEvent, ResultEvent } from '@/lib/claude/types'

const workspaceDir = path.resolve('data/workspace')

/**
 * Auto-generate a title from the first user message.
 * Trims to 50 chars at the last word boundary.
 */
function generateTitle(firstMessage: string): string {
  const maxLen = 50
  if (firstMessage.length <= maxLen) return firstMessage
  const trimmed = firstMessage.slice(0, maxLen)
  const lastSpace = trimmed.lastIndexOf(' ')
  return (lastSpace > 20 ? trimmed.slice(0, lastSpace) : trimmed) + '...'
}

export const chatRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt must not be empty'),
  sessionId: z.string().optional(),
})

export interface ChatStreamCallbacks {
  onEvent: (event: object) => void
  onError: (error: string) => void
  onClose: () => void
}

/**
 * Start a chat stream with Claude. Transport-agnostic — callers provide
 * callbacks for event delivery.
 *
 * Returns { cancel } to abort the underlying Claude process.
 */
export async function startChatStream(
  params: { prompt: string; sessionId?: string },
  callbacks: ChatStreamCallbacks,
): Promise<{ cancel: () => void }> {
  const { prompt, sessionId: providedSessionId } = params
  const sessionId = providedSessionId || crypto.randomUUID()

  // Create or get session record
  const existingSession = db.query.sessions
    .findFirst({
      where: eq(sessions.id, sessionId),
    })
    .sync()

  let claudeResumeSessionId: string | undefined

  if (existingSession) {
    claudeResumeSessionId = existingSession.claudeSessionId ?? undefined
    if (!existingSession.title) {
      db.update(sessions)
        .set({ title: generateTitle(prompt) })
        .where(eq(sessions.id, sessionId))
        .run()
    }
  } else {
    db.insert(sessions)
      .values({ id: sessionId, status: 'active', title: generateTitle(prompt) })
      .run()
  }

  // Create user message record
  const userMessageId = crypto.randomUUID()
  db.insert(messages)
    .values({
      id: userMessageId,
      sessionId,
      role: 'user',
      content: prompt,
    })
    .run()

  // Send session event
  callbacks.onEvent({ type: 'session', sessionId })

  // Search memory for relevant context (non-fatal if it fails)
  let memoryContext: { filePath: string; heading: string; content: string; startLine: number; endLine: number }[] = []
  let systemPromptAppend = ''
  try {
    const results = await hybridSearch(prompt, 3)
    if (results.length > 0) {
      memoryContext = results.map(r => ({
        filePath: r.filePath,
        heading: r.heading,
        content: r.content,
        startLine: r.startLine,
        endLine: r.endLine,
      }))
      const contextSnippets = results.map(r =>
        `[${r.filePath}:${r.startLine}-${r.endLine}] ${r.heading}\n${r.content}`
      ).join('\n\n---\n\n')
      systemPromptAppend = `\n\nRelevant memory context from prior sessions:\n${contextSnippets}`
    }
  } catch (err) {
    console.error('[chat] Memory search failed (non-fatal):', err)
  }

  // Send memory context event
  if (memoryContext.length > 0) {
    callbacks.onEvent({ type: 'memory_context', snippets: memoryContext })
  }

  // Detect /init command or first-time user (no memories) for onboarding
  const isInitCommand = prompt.trim().toLowerCase() === '/init'
  const isFirstTime = !claudeResumeSessionId && !hasMemories()

  if (isInitCommand || isFirstTime) {
    systemPromptAppend += `\n\n# Onboarding

The user is ${isInitCommand ? 're-running onboarding' : 'new — this is their first conversation'}.
Start a friendly onboarding conversation to learn about them.

**Rules:**
- Ask questions ONE AT A TIME. Do not present a list of questions.
- Be conversational and warm, not robotic or formal.
- Start by introducing yourself briefly and asking their name.
- Over subsequent messages, naturally gather:
  - Their name
  - What they do (role, occupation, field)
  - What they're currently working on / interested in
  - How they prefer to communicate (concise vs. detailed, casual vs. formal)
- After each answer, save what you've learned using **memory_write**:
  - Save profile info to \`memory/user-profile.md\`
  - Save project/work context to \`memory/projects.md\`
- Don't wait until the end — save incrementally as you learn things.
- Keep the conversation flowing naturally; 3–5 exchanges is a good length.
${isInitCommand ? '- The user already has memories. Merge new info with existing files rather than overwriting.' : ''}`
  }

  // Built-in MCP servers passed inline; user servers discovered via cwd
  const mcpConfig = getBuiltinMcpConfig()

  // Build the system prompt
  const systemPrompt = buildSystemPrompt({ workspaceDir })

  // Spawn Claude process
  let child: ReturnType<typeof processManager.spawn>
  try {
    child = processManager.spawn(sessionId, prompt, {
      resumeSessionId: claudeResumeSessionId,
      systemPrompt,
      appendSystemPrompt: systemPromptAppend || undefined,
      mcpConfig,
      cwd: workspaceDir,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to spawn Claude process'
    callbacks.onError(message)
    callbacks.onClose()
    return { cancel: () => {} }
  }

  // Accumulate streamed text server-side for DB persistence
  let accumulatedText = ''

  // Parse NDJSON from Claude's stdout
  if (child.stdout) {
    parseNDJSON(
      child.stdout,
      (event: ClaudeEvent) => {
        // Forward all events to the caller
        try {
          callbacks.onEvent(event)
        } catch {
          // Callback might fail if transport is closed
        }

        // Accumulate text from stream deltas for DB persistence
        if (event.type === 'stream_event') {
          const payload = (event as StreamEvent).event
          if (
            payload.type === 'content_block_delta' &&
            payload.delta?.type === 'text_delta' &&
            payload.delta.text
          ) {
            accumulatedText += payload.delta.text
          }
        }

        // Extract Claude session_id from system init event
        if (event.type === 'system' && (event as SystemEvent).subtype === 'init') {
          const claudeSessionId = event.session_id
          if (claudeSessionId) {
            try {
              db.update(sessions)
                .set({ claudeSessionId })
                .where(eq(sessions.id, sessionId))
                .run()
            } catch (dbErr) {
              console.error('[chat] Failed to update Claude session ID:', dbErr)
            }
          }
        }

        // On result event, save assistant message and signal close
        if (event.type === 'result') {
          const resultEvent = event as ResultEvent
          try {
            db.insert(messages)
              .values({
                id: crypto.randomUUID(),
                sessionId,
                role: 'assistant',
                content: resultEvent.result || accumulatedText,
                costUsd: resultEvent.total_cost_usd
                  ? Math.round(resultEvent.total_cost_usd * 1_000_000)
                  : null,
                inputTokens: resultEvent.usage?.input_tokens ?? null,
                outputTokens: resultEvent.usage?.output_tokens ?? null,
                durationMs: resultEvent.duration_ms ?? null,
              })
              .run()

            db.update(sessions)
              .set({
                status: resultEvent.is_error ? 'error' : 'completed',
                updatedAt: new Date(),
              })
              .where(eq(sessions.id, sessionId))
              .run()
          } catch (dbErr) {
            console.error('[chat] Failed to save result:', dbErr)
          }

          callbacks.onClose()
        }
      },
      (error: Error) => {
        console.error('[chat] NDJSON parse error:', error.message)
        callbacks.onError(error.message)
      },
    )
  }

  // Handle stderr
  if (child.stderr) {
    child.stderr.on('data', (chunk: Buffer) => {
      console.error('[claude stderr]', chunk.toString('utf-8'))
    })
  }

  // Handle process exit
  child.on('exit', (code: number | null, signal: string | null) => {
    if (code !== null && code !== 0) {
      callbacks.onError(
        `Claude process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`,
      )
      callbacks.onClose()
    } else if (code === null && signal) {
      callbacks.onError(`Claude process killed by signal: ${signal}`)
      callbacks.onClose()
    }
  })

  return {
    cancel: () => processManager.kill(sessionId),
  }
}
