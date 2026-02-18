import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { handleChatRequest } from './lib/claude/chat-handler'
import { handleMcpRequest } from './lib/mcp/http-handler'
import { synthesizeStream } from './lib/tts/kokoro'
import { ensureWorkspace } from './lib/workspace/init'

ensureWorkspace()

const handler = createStartHandler(defaultStreamHandler)

export default {
  fetch: async (request: Request): Promise<Response> => {
    const url = new URL(request.url)

    // Route /api/mcp requests to the HTTP MCP handler
    if (url.pathname === '/api/mcp') {
      return handleMcpRequest(request)
    }

    // Route /api/tts POST requests to streaming Kokoro TTS handler
    // Streams back length-prefixed WAV chunks (4-byte LE uint32 length + WAV data per sentence)
    if (url.pathname === '/api/tts' && request.method === 'POST') {
      try {
        const body = await request.json() as { text?: string; voice?: string; speed?: number }
        if (!body.text || typeof body.text !== 'string') {
          return new Response(JSON.stringify({ error: 'text is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const gen = synthesizeStream(body.text, body.voice, body.speed)
        const stream = new ReadableStream({
          async pull(controller) {
            const { done, value } = await gen.next()
            if (done) {
              controller.close()
              return
            }
            // Frame: 4-byte LE length prefix + WAV bytes
            const header = new Uint8Array(4)
            new DataView(header.buffer).setUint32(0, value.byteLength, true)
            controller.enqueue(header)
            controller.enqueue(value)
          },
        })

        return new Response(stream, {
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[tts] Error:', message)
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Route /api/chat POST requests to the SSE streaming handler
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChatRequest(request)
    }

    // All other requests go through TanStack Start SSR
    return handler(request)
  },
}
