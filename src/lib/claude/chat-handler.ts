/**
 * SSE streaming endpoint: POST /api/chat
 *
 * Thin transport wrapper over chat-core. Encodes events as SSE data lines.
 * The web UI continues to work unchanged.
 */
import { chatRequestSchema, startChatStream } from '@/lib/claude/chat-core'

export async function handleChatRequest(request: Request): Promise<Response> {
  try {
    const body = await request.json()
    const parsed = chatRequestSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parsed.error.issues }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const { prompt, sessionId } = parsed.data
    const encoder = new TextEncoder()
    let cancelStream: (() => void) | null = null

    const stream = new ReadableStream({
      async start(controller) {
        const { cancel } = await startChatStream(
          { prompt, sessionId },
          {
            onEvent: (event) => {
              try {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
                )
              } catch {
                // Controller might be closed if client disconnected
              }
            },
            onError: (error) => {
              try {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'error', error })}\n\n`),
                )
              } catch {
                // Controller might be closed
              }
            },
            onClose: () => {
              try {
                controller.close()
              } catch {
                // Already closed
              }
            },
          },
        )

        cancelStream = cancel
      },
      cancel() {
        // Client disconnected — kill the Claude process
        cancelStream?.()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
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
