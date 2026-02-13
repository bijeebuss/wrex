/**
 * SSE streaming endpoint: POST /api/chat
 *
 * Bridges Claude Code CLI to the browser via Server-Sent Events.
 * 1. Browser POSTs { prompt, sessionId? }
 * 2. Server spawns Claude CLI process with NDJSON streaming output
 * 3. NDJSON events are parsed and forwarded as SSE data lines
 * 4. On client disconnect, the Claude process is killed
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

const chatRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt must not be empty'),
  sessionId: z.string().optional(),
})

export async function handleChatRequest(request: Request): Promise<Response> {
  try {
    // Parse and validate request body
    const body = await request.json()
    const parsed = chatRequestSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parsed.error.issues }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const { prompt, sessionId: providedSessionId } = parsed.data
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
      // Defensive: if existing session has no title, generate one
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
      // Continue without memory context
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

    // Resolve MCP config path (always pass for memory tool access)
    const mcpConfigPath = path.resolve('.mcp.json')

    // Build the system prompt
    const systemPrompt = buildSystemPrompt({ workspaceDir })

    const encoder = new TextEncoder()

    // Create the SSE streaming response
    const stream = new ReadableStream({
      start(controller) {
        // Send the sessionId as the first event so the client knows it
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`),
        )

        // Send memory context as second event (before Claude starts streaming)
        if (memoryContext.length > 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'memory_context',
              snippets: memoryContext,
            })}\n\n`),
          )
        }

        let child: ReturnType<typeof processManager.spawn>
        try {
          child = processManager.spawn(sessionId, prompt, {
            resumeSessionId: claudeResumeSessionId,
            systemPrompt,
            appendSystemPrompt: systemPromptAppend || undefined,
            mcpConfigPath,
            cwd: workspaceDir,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to spawn Claude process'
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`),
          )
          controller.close()
          return
        }

        // Accumulate streamed text server-side so we can persist it.
        // The result event's `result` field can be empty for tool-use responses,
        // but the actual text is streamed via content_block_delta events.
        let accumulatedText = ''

        // Parse NDJSON from Claude's stdout
        if (child.stdout) {
          parseNDJSON(
            child.stdout,
            (event: ClaudeEvent) => {
              // Forward all events to the client
              try {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
                )
              } catch {
                // Controller might be closed if client disconnected
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

              // On result event, save assistant message and close stream
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

                  // Update session status
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

                try {
                  controller.close()
                } catch {
                  // Already closed
                }
              }
            },
            (error: Error) => {
              console.error('[chat] NDJSON parse error:', error.message)
              try {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`,
                  ),
                )
              } catch {
                // Controller might be closed
              }
            },
          )
        }

        // Handle stderr (log to console but don't send to client)
        if (child.stderr) {
          child.stderr.on('data', (chunk: Buffer) => {
            console.error('[claude stderr]', chunk.toString('utf-8'))
          })
        }

        // Handle process exit
        child.on('exit', (code: number | null, signal: string | null) => {
          if (code !== null && code !== 0) {
            try {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'error',
                    error: `Claude process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`,
                  })}\n\n`,
                ),
              )
              controller.close()
            } catch {
              // Controller might be already closed
            }
          } else if (code === null && signal) {
            // Process killed by signal without producing result
            try {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'error',
                    error: `Claude process killed by signal: ${signal}`,
                  })}\n\n`,
                ),
              )
              controller.close()
            } catch {
              // Controller might be already closed
            }
          }
        })
      },

      cancel() {
        // Client disconnected -- kill the Claude process
        processManager.kill(sessionId)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Session-Id': sessionId,
      },
    })
  } catch (err) {
    console.error('[chat] Handler error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
