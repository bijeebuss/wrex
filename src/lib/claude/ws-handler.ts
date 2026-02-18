/**
 * WebSocket handler for /ws/chat
 *
 * Protocol — Client → Server:
 *   { type: "chat", prompt: string, sessionId?: string }
 *   { type: "cancel" }
 *   { type: "ping" }
 *
 * Protocol — Server → Client:
 *   Same event shapes as SSE data payloads (session, memory_context,
 *   stream_event, system, assistant, result, error, pong).
 */
import type { WebSocket } from 'ws'
import { startChatStream } from '@/lib/claude/chat-core'

interface ChatMessage {
  type: 'chat'
  prompt: string
  sessionId?: string
}

interface CancelMessage {
  type: 'cancel'
}

interface PingMessage {
  type: 'ping'
}

type ClientMessage = ChatMessage | CancelMessage | PingMessage

function send(ws: WebSocket, data: object): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

export function handleWebSocketConnection(ws: WebSocket): void {
  let activeCancel: (() => void) | null = null
  let isStreaming = false

  ws.on('message', async (raw) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      send(ws, { type: 'error', error: 'Invalid JSON' })
      return
    }

    if (msg.type === 'ping') {
      send(ws, { type: 'pong' })
      return
    }

    if (msg.type === 'cancel') {
      if (activeCancel) {
        activeCancel()
        activeCancel = null
        isStreaming = false
      }
      return
    }

    if (msg.type === 'chat') {
      if (isStreaming) {
        send(ws, { type: 'error', error: 'Already streaming. Send cancel first.' })
        return
      }

      if (!msg.prompt || typeof msg.prompt !== 'string' || !msg.prompt.trim()) {
        send(ws, { type: 'error', error: 'Prompt must not be empty' })
        return
      }

      isStreaming = true

      const { cancel } = await startChatStream(
        { prompt: msg.prompt, sessionId: msg.sessionId },
        {
          onEvent: (event) => send(ws, event),
          onError: (error) => send(ws, { type: 'error', error }),
          onClose: () => {
            activeCancel = null
            isStreaming = false
          },
        },
      )

      activeCancel = cancel
      return
    }

    send(ws, { type: 'error', error: `Unknown message type: ${(msg as any).type}` })
  })

  ws.on('close', () => {
    if (activeCancel) {
      activeCancel()
      activeCancel = null
      isStreaming = false
    }
  })

  ws.on('error', (err) => {
    console.error('[ws] WebSocket error:', err)
    if (activeCancel) {
      activeCancel()
      activeCancel = null
      isStreaming = false
    }
  })
}
