import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useCallback } from 'react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [prompt, setPrompt] = useState('')
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const [resultInfo, setResultInfo] = useState<{
    inputTokens?: number
    outputTokens?: number
    durationMs?: number
    costUsd?: number
  } | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!prompt.trim() || status === 'streaming') return

      setOutput('')
      setResultInfo(null)
      setStatus('streaming')

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: prompt.trim(),
            ...(sessionId ? { sessionId } : {}),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Request failed' }))
          setOutput(`Error: ${err.error || response.statusText}`)
          setStatus('error')
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          setOutput('Error: No response stream')
          setStatus('error')
          return
        }

        // Capture session ID from header
        const headerSessionId = response.headers.get('X-Session-Id')
        if (headerSessionId) {
          setSessionId(headerSessionId)
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

              // Session event -- capture sessionId
              if (event.type === 'session' && event.sessionId) {
                setSessionId(event.sessionId)
              }

              // Stream event with text delta -- append text
              if (
                event.type === 'stream_event' &&
                event.event?.type === 'content_block_delta' &&
                event.event?.delta?.type === 'text_delta' &&
                event.event?.delta?.text
              ) {
                setOutput((prev) => prev + event.event.delta.text)
              }

              // Result event -- show completion info
              if (event.type === 'result') {
                setResultInfo({
                  inputTokens: event.usage?.input_tokens,
                  outputTokens: event.usage?.output_tokens,
                  durationMs: event.duration_ms,
                  costUsd: event.total_cost_usd,
                })
                setStatus('done')
              }

              // Error event
              if (event.type === 'error') {
                setOutput((prev) => prev + `\n[Error: ${event.error}]`)
                setStatus('error')
              }
            } catch {
              // Skip unparseable SSE lines
            }
          }
        }

        // If we haven't set done status yet (stream ended without result event)
        setStatus((prev) => (prev === 'streaming' ? 'done' : prev))
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setStatus('idle')
        } else {
          setOutput(`Error: ${(err as Error).message}`)
          setStatus('error')
        }
      } finally {
        abortRef.current = null
      }
    },
    [prompt, status, sessionId],
  )

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle')
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        maxWidth: '800px',
        margin: '0 auto',
        padding: '1rem',
        gap: '1rem',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Wrex</h1>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '0.15rem 0.5rem',
            borderRadius: '9999px',
            background:
              status === 'streaming'
                ? '#2563eb'
                : status === 'done'
                  ? '#16a34a'
                  : status === 'error'
                    ? '#dc2626'
                    : '#6b7280',
            color: '#fff',
          }}
        >
          {status === 'streaming'
            ? 'Streaming...'
            : status === 'done'
              ? 'Done'
              : status === 'error'
                ? 'Error'
                : 'Ready'}
        </span>
        {sessionId && (
          <span style={{ fontSize: '0.7rem', opacity: 0.5, fontFamily: 'monospace' }}>
            Session: {sessionId.slice(0, 8)}...
          </span>
        )}
      </div>

      {/* Output area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.1)',
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {output || (
          <span style={{ opacity: 0.4 }}>
            Send a message to start a conversation with Claude...
          </span>
        )}
      </div>

      {/* Result info */}
      {resultInfo && (
        <div
          style={{
            fontSize: '0.75rem',
            opacity: 0.6,
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          {resultInfo.inputTokens != null && (
            <span>Input: {resultInfo.inputTokens.toLocaleString()} tokens</span>
          )}
          {resultInfo.outputTokens != null && (
            <span>Output: {resultInfo.outputTokens.toLocaleString()} tokens</span>
          )}
          {resultInfo.durationMs != null && (
            <span>Duration: {(resultInfo.durationMs / 1000).toFixed(1)}s</span>
          )}
          {resultInfo.costUsd != null && (
            <span>Cost: ${resultInfo.costUsd.toFixed(4)}</span>
          )}
        </div>
      )}

      {/* Input form */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          gap: '0.5rem',
        }}
      >
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Type a prompt..."
          disabled={status === 'streaming'}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            color: 'inherit',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
        {status === 'streaming' ? (
          <button
            type="button"
            onClick={handleStop}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!prompt.trim()}
            style={{
              padding: '0.75rem 1.5rem',
              background: prompt.trim() ? '#2563eb' : '#374151',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: prompt.trim() ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
              fontWeight: 600,
              opacity: prompt.trim() ? 1 : 0.5,
            }}
          >
            Send
          </button>
        )}
      </form>
    </div>
  )
}
