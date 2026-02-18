import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

/**
 * Vite plugin that attaches a WebSocket server to the dev server's HTTP server.
 * Only intercepts upgrade requests for /ws/chat — all other upgrades (Vite HMR)
 * pass through untouched.
 */
function webSocketPlugin(): Plugin {
  return {
    name: 'wrex-websocket',
    configureServer(server) {
      // Use ssrLoadModule so @/ path aliases resolve through Vite's pipeline
      const setupWs = async () => {
        const { WebSocketServer } = await import('ws')
        const mod = await server.ssrLoadModule('./src/lib/claude/ws-handler') as { handleWebSocketConnection: (ws: any) => void }
        const { handleWebSocketConnection } = mod

        const wss = new WebSocketServer({ noServer: true })

        wss.on('connection', (ws) => {
          handleWebSocketConnection(ws)
        })

        server.httpServer?.on('upgrade', (req, socket, head) => {
          // Only handle /ws/chat — let Vite handle everything else (HMR)
          if (req.url === '/ws/chat') {
            wss.handleUpgrade(req, socket, head, (ws) => {
              wss.emit('connection', ws, req)
            })
          }
        })

        console.log('[ws] WebSocket server ready on /ws/chat')
      }

      // httpServer is available after the server starts listening
      server.httpServer?.on('listening', () => {
        setupWs().catch((err) => {
          console.error('[ws] Failed to set up WebSocket server:', err)
        })
      })
    },
  }
}

export default defineConfig({
  server: { port: 55520 },
  plugins: [tsconfigPaths(), tailwindcss(), webSocketPlugin(), tanstackStart()],
})
