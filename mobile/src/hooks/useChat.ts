/**
 * WebSocket-based chat hook — port of web useChat adapted for RN.
 *
 * Same state shape as web: messages[], status, error, memoryContext, contextUsage.
 * Uses setTimeout(fn, 16) for text batching instead of requestAnimationFrame.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { wsManager } from '../api/websocket'
import type { ChatMessage, ChatStatus, ToolCallState, MemorySnippet, ContextUsage } from '../types'

interface UseChatOptions {
  sessionId?: string
  onSessionCreated?: (id: string) => void
  initialMessages?: ChatMessage[]
}

interface UseChatReturn {
  messages: ChatMessage[]
  status: ChatStatus
  error: string | null
  memoryContext: MemorySnippet[] | null
  contextUsage: ContextUsage | null
  sendMessage: (text: string) => void
  stopStreaming: () => void
  retryLast: () => void
}

let msgIdCounter = 0
function nextMsgId(): string {
  return `msg-${Date.now()}-${++msgIdCounter}`
}

export function useChat(opts: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(opts.initialMessages ?? [])
  const [status, setStatus] = useState<ChatStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [memoryContext, setMemoryContext] = useState<MemorySnippet[] | null>(null)
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)

  const sessionIdRef = useRef<string | undefined>(opts.sessionId)
  const queueRef = useRef<string[]>([])
  const statusRef = useRef<ChatStatus>('idle')
  const onSessionCreatedRef = useRef(opts.onSessionCreated)
  const assistantMsgIdRef = useRef<string | null>(null)

  // Text batching
  const pendingTextRef = useRef('')
  const flushScheduledRef = useRef(false)
  // Track whether we got per-message usage
  const gotMessageUsageRef = useRef(false)

  useEffect(() => {
    sessionIdRef.current = opts.sessionId
  }, [opts.sessionId])

  useEffect(() => {
    onSessionCreatedRef.current = opts.onSessionCreated
  }, [opts.onSessionCreated])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const flushText = useCallback(() => {
    if (pendingTextRef.current) {
      const textToAppend = pendingTextRef.current
      pendingTextRef.current = ''
      const msgId = assistantMsgIdRef.current
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last && last.id === msgId) {
          updated[updated.length - 1] = {
            ...last,
            content: last.content + textToAppend,
          }
        }
        return updated
      })
    }
    flushScheduledRef.current = false
  }, [])

  const scheduleFlush = useCallback(() => {
    if (!flushScheduledRef.current) {
      flushScheduledRef.current = true
      setTimeout(flushText, 16)
    }
  }, [flushText])

  const startStream = useCallback((text: string) => {
    setStatus('streaming')
    statusRef.current = 'streaming'
    setError(null)
    gotMessageUsageRef.current = false

    const assistantMsgId = nextMsgId()
    assistantMsgIdRef.current = assistantMsgId
    setMessages(prev => [
      ...prev,
      { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true },
    ])

    wsManager.send({
      type: 'chat',
      prompt: text,
      ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
    })
  }, [])

  // Set up WebSocket event listeners
  useEffect(() => {
    const unsubscribers: (() => void)[] = []

    unsubscribers.push(wsManager.on('session', (event: any) => {
      if (event.sessionId) {
        sessionIdRef.current = event.sessionId
        onSessionCreatedRef.current?.(event.sessionId)
      }
    }))

    unsubscribers.push(wsManager.on('memory_context', (event: any) => {
      if (event.snippets) {
        setMemoryContext(event.snippets)
      }
    }))

    unsubscribers.push(wsManager.on('stream_event', (event: any) => {
      const payload = event.event
      if (!payload) return
      const msgId = assistantMsgIdRef.current

      // message_start contains per-API-call usage
      if (payload.type === 'message_start' && payload.message) {
        const usage = payload.message.usage
        if (usage && typeof usage.input_tokens === 'number') {
          gotMessageUsageRef.current = true
          setContextUsage({
            inputTokens:
              (usage.input_tokens ?? 0) +
              (usage.cache_creation_input_tokens ?? 0) +
              (usage.cache_read_input_tokens ?? 0),
            outputTokens: usage.output_tokens ?? 0,
          })
        }
      }

      // content_block_start
      if (payload.type === 'content_block_start') {
        const contentBlock = payload.content_block
        if (contentBlock?.type === 'tool_use') {
          const toolCall: ToolCallState = {
            id: contentBlock.id || `tool-${payload.index ?? 0}`,
            name: contentBlock.name || 'unknown',
            input: '',
            status: 'running',
          }
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last && last.id === msgId) {
              updated[updated.length - 1] = {
                ...last,
                toolCalls: [...(last.toolCalls || []), toolCall],
              }
            }
            return updated
          })
        }
      }

      // content_block_delta
      if (payload.type === 'content_block_delta' && payload.delta) {
        if (payload.delta.type === 'text_delta' && payload.delta.text) {
          pendingTextRef.current += payload.delta.text
          scheduleFlush()
        }
        if (payload.delta.type === 'input_json_delta' && payload.delta.partial_json) {
          const partialJson = payload.delta.partial_json
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last && last.id === msgId && last.toolCalls?.length) {
              const tools = [...last.toolCalls]
              const lastTool = tools[tools.length - 1]
              tools[tools.length - 1] = {
                ...lastTool,
                input: lastTool.input + partialJson,
              }
              updated[updated.length - 1] = { ...last, toolCalls: tools }
            }
            return updated
          })
        }
      }

      // content_block_stop
      if (payload.type === 'content_block_stop') {
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.id === msgId && last.toolCalls?.length) {
            const tools = [...last.toolCalls]
            const lastTool = tools[tools.length - 1]
            if (lastTool.status === 'running') {
              tools[tools.length - 1] = { ...lastTool, status: 'complete' }
              updated[updated.length - 1] = { ...last, toolCalls: tools }
            }
          }
          return updated
        })
      }
    }))

    unsubscribers.push(wsManager.on('result', (event: any) => {
      const msgId = assistantMsgIdRef.current
      if (!gotMessageUsageRef.current && event.usage) {
        const u = event.usage
        setContextUsage({
          inputTokens:
            (u.input_tokens ?? 0) +
            (u.cache_creation_input_tokens ?? 0) +
            (u.cache_read_input_tokens ?? 0),
          outputTokens: u.output_tokens ?? 0,
        })
      }
      // Flush remaining text
      flushText()
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last && last.id === msgId) {
          updated[updated.length - 1] = { ...last, isStreaming: false }
        }
        return updated
      })
      setStatus('done')
      statusRef.current = 'done'
      assistantMsgIdRef.current = null

      // Check queue for pending messages
      if (queueRef.current.length > 0) {
        const next = queueRef.current.shift()!
        setTimeout(() => startStream(next), 0)
      }
    }))

    unsubscribers.push(wsManager.on('error', (event: any) => {
      const msgId = assistantMsgIdRef.current
      if (msgId) {
        flushText()
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.id === msgId) {
            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              error: event.error || 'Unknown error',
            }
          }
          return updated
        })
        setStatus('error')
        statusRef.current = 'error'
        assistantMsgIdRef.current = null
      }
    }))

    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [flushText, scheduleFlush, startStream])

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const userMsg: ChatMessage = {
      id: nextMsgId(),
      role: 'user',
      content: trimmed,
    }
    setMessages(prev => [...prev, userMsg])

    if (statusRef.current === 'streaming') {
      queueRef.current.push(trimmed)
      return
    }

    startStream(trimmed)
  }, [startStream])

  const stopStreaming = useCallback(() => {
    wsManager.send({ type: 'cancel' })
    assistantMsgIdRef.current = null
    setStatus('idle')
    statusRef.current = 'idle'
    setMessages(prev => {
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last?.isStreaming) {
        updated[updated.length - 1] = { ...last, isStreaming: false }
      }
      return updated
    })
  }, [])

  const retryLast = useCallback(() => {
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx === -1) return

    const lastUserMsg = messages[lastUserIdx]
    setMessages(prev => prev.slice(0, lastUserIdx + 1))
    startStream(lastUserMsg.content)
  }, [messages, startStream])

  return { messages, status, error, memoryContext, contextUsage, sendMessage, stopStreaming, retryLast }
}
