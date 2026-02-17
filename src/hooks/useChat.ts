import { useState, useCallback, useRef, useEffect } from 'react'
import type { ChatMessage, ChatStatus, ToolCallState, MemorySnippet, ContextUsage } from '../types/chat'

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
  const abortRef = useRef<AbortController | null>(null)
  const statusRef = useRef<ChatStatus>('idle')
  const onSessionCreatedRef = useRef(opts.onSessionCreated)

  // Keep refs in sync
  useEffect(() => {
    sessionIdRef.current = opts.sessionId
  }, [opts.sessionId])

  useEffect(() => {
    onSessionCreatedRef.current = opts.onSessionCreated
  }, [opts.onSessionCreated])

  // Sync status to ref for use in callbacks
  useEffect(() => {
    statusRef.current = status
  }, [status])

  const startStream = useCallback(async (text: string) => {
    setStatus('streaming')
    statusRef.current = 'streaming'
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller

    // Add empty assistant message to accumulate into
    const assistantMsgId = nextMsgId()
    setMessages(prev => [
      ...prev,
      { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true },
    ])

    // Track content block state for tool calls
    let currentBlockIndex = -1
    let currentBlockType: 'text' | 'tool_use' | null = null
    let pendingText = ''
    let rafScheduled = false
    // Track whether we got per-message usage (more accurate than aggregate result usage)
    let gotMessageUsage = false

    // Batch text delta updates via requestAnimationFrame
    function flushText() {
      if (pendingText) {
        const textToAppend = pendingText
        pendingText = ''
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.id === assistantMsgId) {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + textToAppend,
            }
          }
          return updated
        })
      }
      rafScheduled = false
    }

    function scheduleFlush() {
      if (!rafScheduled) {
        rafScheduled = true
        requestAnimationFrame(flushText)
      }
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }))
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.id === assistantMsgId) {
            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              error: err.error || response.statusText,
            }
          }
          return updated
        })
        setStatus('error')
        statusRef.current = 'error'
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.id === assistantMsgId) {
            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              error: 'No response stream',
            }
          }
          return updated
        })
        setStatus('error')
        statusRef.current = 'error'
        return
      }

      const decoder = new TextDecoder()
      let sseBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })
        const lines = sseBuffer.split('\n\n')
        sseBuffer = lines.pop() || ''

        for (const block of lines) {
          const dataLine = block.trim()
          if (!dataLine.startsWith('data: ')) continue
          const jsonStr = dataLine.slice(6)

          try {
            const event = JSON.parse(jsonStr)

            // Session event
            if (event.type === 'session' && event.sessionId) {
              sessionIdRef.current = event.sessionId
              onSessionCreatedRef.current?.(event.sessionId)
            }

            // Memory context event
            if (event.type === 'memory_context' && event.snippets) {
              setMemoryContext(event.snippets)
            }

            // Stream event handling
            if (event.type === 'stream_event' && event.event) {
              const payload = event.event

              // message_start contains per-API-call usage (actual context window size)
              // This is more accurate than result.usage which is aggregate across all sub-calls
              if (payload.type === 'message_start' && payload.message) {
                const msg = payload.message as Record<string, unknown>
                const usage = msg.usage as Record<string, number> | undefined
                if (usage && typeof usage.input_tokens === 'number') {
                  gotMessageUsage = true
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
                currentBlockIndex = payload.index ?? currentBlockIndex + 1
                const contentBlock = payload.content_block
                if (contentBlock?.type === 'tool_use') {
                  currentBlockType = 'tool_use'
                  const toolCall: ToolCallState = {
                    id: contentBlock.id || `tool-${currentBlockIndex}`,
                    name: contentBlock.name || 'unknown',
                    input: '',
                    status: 'running',
                  }
                  setMessages(prev => {
                    const updated = [...prev]
                    const last = updated[updated.length - 1]
                    if (last && last.id === assistantMsgId) {
                      updated[updated.length - 1] = {
                        ...last,
                        toolCalls: [...(last.toolCalls || []), toolCall],
                      }
                    }
                    return updated
                  })
                } else {
                  currentBlockType = 'text'
                }
              }

              // content_block_delta
              if (payload.type === 'content_block_delta' && payload.delta) {
                if (payload.delta.type === 'text_delta' && payload.delta.text) {
                  pendingText += payload.delta.text
                  scheduleFlush()
                }
                if (payload.delta.type === 'input_json_delta' && payload.delta.partial_json) {
                  const partialJson = payload.delta.partial_json
                  setMessages(prev => {
                    const updated = [...prev]
                    const last = updated[updated.length - 1]
                    if (last && last.id === assistantMsgId && last.toolCalls?.length) {
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
                if (currentBlockType === 'tool_use') {
                  setMessages(prev => {
                    const updated = [...prev]
                    const last = updated[updated.length - 1]
                    if (last && last.id === assistantMsgId && last.toolCalls?.length) {
                      const tools = [...last.toolCalls]
                      const lastTool = tools[tools.length - 1]
                      tools[tools.length - 1] = { ...lastTool, status: 'complete' }
                      updated[updated.length - 1] = { ...last, toolCalls: tools }
                    }
                    return updated
                  })
                }
                currentBlockType = null
              }
            }

            // Result event
            if (event.type === 'result') {
              // Only use result.usage as fallback — it's aggregate across all sub-calls
              // in a turn, so it inflates the number. Per-message usage from message_start
              // events (captured above) is the actual context window size.
              if (!gotMessageUsage && event.usage) {
                const u = event.usage
                setContextUsage({
                  inputTokens:
                    (u.input_tokens ?? 0) +
                    (u.cache_creation_input_tokens ?? 0) +
                    (u.cache_read_input_tokens ?? 0),
                  outputTokens: u.output_tokens ?? 0,
                })
              }
              // Flush any remaining text
              flushText()
              setMessages(prev => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last && last.id === assistantMsgId) {
                  updated[updated.length - 1] = { ...last, isStreaming: false }
                }
                return updated
              })
              setStatus('done')
              statusRef.current = 'done'

              // Check queue for pending messages
              if (queueRef.current.length > 0) {
                const next = queueRef.current.shift()!
                // Use setTimeout to let state settle before starting next stream
                setTimeout(() => startStream(next), 0)
              }
            }

            // Error event
            if (event.type === 'error') {
              flushText()
              setMessages(prev => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last && last.id === assistantMsgId) {
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
            }
          } catch {
            // Skip unparseable SSE lines
          }
        }
      }

      // Stream ended without explicit result event
      flushText()
      setStatus(prev => (prev === 'streaming' ? 'done' : prev))
      statusRef.current = statusRef.current === 'streaming' ? 'done' : statusRef.current
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last && last.id === assistantMsgId && last.isStreaming) {
          updated[updated.length - 1] = { ...last, isStreaming: false }
        }
        return updated
      })
    } catch (err) {
      flushText()
      if ((err as Error).name === 'AbortError') {
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.id === assistantMsgId) {
            updated[updated.length - 1] = { ...last, isStreaming: false }
          }
          return updated
        })
        setStatus('idle')
        statusRef.current = 'idle'
      } else {
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.id === assistantMsgId) {
            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              error: (err as Error).message,
            }
          }
          return updated
        })
        setError((err as Error).message)
        setStatus('error')
        statusRef.current = 'error'
      }
    } finally {
      abortRef.current = null
    }
  }, [])

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
      // Queue message to send after current stream completes
      queueRef.current.push(trimmed)
      return
    }

    startStream(trimmed)
  }, [startStream])

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
    statusRef.current = 'idle'
  }, [])

  const retryLast = useCallback(() => {
    // Find the last user message
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx === -1) return

    const lastUserMsg = messages[lastUserIdx]
    // Remove the errored assistant message (should be the one after the last user message)
    setMessages(prev => {
      const updated = [...prev]
      // Remove any assistant messages after the last user message
      const trimmed = updated.slice(0, lastUserIdx + 1)
      return trimmed
    })

    startStream(lastUserMsg.content)
  }, [messages, startStream])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  return { messages, status, error, memoryContext, contextUsage, sendMessage, stopStreaming, retryLast }
}
