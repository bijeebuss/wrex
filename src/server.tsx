import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { handleChatRequest } from './lib/claude/chat-handler'

const handler = createStartHandler(defaultStreamHandler)

export default {
  fetch: async (request: Request): Promise<Response> => {
    const url = new URL(request.url)

    // Route /api/chat POST requests to the SSE streaming handler
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChatRequest(request)
    }

    // All other requests go through TanStack Start SSR
    return handler(request)
  },
}
