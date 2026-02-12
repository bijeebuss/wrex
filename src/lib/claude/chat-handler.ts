/**
 * SSE streaming endpoint: POST /api/chat
 *
 * Bridges Claude Code CLI to the browser via Server-Sent Events.
 * 1. Browser POSTs { prompt, sessionId? }
 * 2. Server spawns Claude CLI process with NDJSON streaming output
 * 3. NDJSON events are parsed and forwarded as SSE data lines
 * 4. On client disconnect, the Claude process is killed
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/index'
import { sessions, messages } from '@/lib/db/schema'
import { processManager } from '@/lib/claude/process-manager'
import { parseNDJSON } from '@/lib/claude/ndjson-parser'
import type { ClaudeEvent, SystemEvent, ResultEvent } from '@/lib/claude/types'

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

    const encoder = new TextEncoder()

    // Create the SSE streaming response
    const stream = new ReadableStream({
      start(controller) {
        // Send the sessionId as the first event so the client knows it
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`),
        )

        let child: ReturnType<typeof processManager.spawn>
        try {
          child = processManager.spawn(sessionId, prompt, {
            resumeSessionId: claudeResumeSessionId,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to spawn Claude process'
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`),
          )
          controller.close()
          return
        }

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
                      content: resultEvent.result || '',
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
