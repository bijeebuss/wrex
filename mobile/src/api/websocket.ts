/**
 * Persistent WebSocket connection manager.
 *
 * Singleton that manages a WebSocket connection to the Wrex backend.
 * Features: auto-reconnect with exponential backoff, ping/pong keepalive,
 * event listener pattern.
 */
import { getServerUrl } from '../config'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

type EventCallback = (data: any) => void
type StatusCallback = (status: ConnectionStatus) => void

class WebSocketManager {
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<EventCallback>>()
  private statusListeners = new Set<StatusCallback>()
  private _status: ConnectionStatus = 'disconnected'
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private shouldReconnect = false

  get status(): ConnectionStatus {
    return this._status
  }

  private setStatus(status: ConnectionStatus) {
    this._status = status
    this.statusListeners.forEach(cb => cb(status))
  }

  async connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.shouldReconnect = true
    await this._connect()
  }

  private async _connect(): Promise<void> {
    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')

    const httpUrl = await getServerUrl()
    const wsUrl = httpUrl.replace(/^http/, 'ws') + '/ws/chat'

    try {
      this.ws = new WebSocket(wsUrl)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.setStatus('connected')
      this.startPing()
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const type = data.type as string
        this.listeners.get(type)?.forEach(cb => cb(data))
        // Also fire wildcard listeners
        this.listeners.get('*')?.forEach(cb => cb(data))
      } catch {
        // Skip unparseable messages
      }
    }

    this.ws.onclose = () => {
      this.stopPing()
      this.setStatus('disconnected')
      if (this.shouldReconnect) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      // onclose will fire after this
    }
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.stopPing()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected')
  }

  send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  on(eventType: string, callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(callback)
    return () => {
      this.listeners.get(eventType)?.delete(callback)
    }
  }

  onStatus(callback: StatusCallback): () => void {
    this.statusListeners.add(callback)
    return () => {
      this.statusListeners.delete(callback)
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this._connect()
    }, delay)
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' })
    }, 30000)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }
}

// Singleton
export const wsManager = new WebSocketManager()
