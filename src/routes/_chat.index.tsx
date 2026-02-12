import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useRef, useEffect } from 'react'
import { useChat } from '@/hooks/useChat'
import { ChatMessages } from '@/components/chat/ChatMessages'
import { ChatInput } from '@/components/chat/ChatInput'

export const Route = createFileRoute('/_chat/')({
  component: NewChat,
})

function NewChat() {
  const navigate = useNavigate()
  const router = useRouter()
  const pendingSessionIdRef = useRef<string | null>(null)

  const handleSessionCreated = useCallback(
    (id: string) => {
      // Don't navigate during streaming — just track the session ID
      // and update the URL silently so it looks correct
      pendingSessionIdRef.current = id
      window.history.replaceState(null, '', `/${id}`)
      // Refresh sidebar to show the new session
      router.invalidate()
    },
    [router],
  )

  const { messages, status, memoryContext, sendMessage, stopStreaming, retryLast } = useChat({
    onSessionCreated: handleSessionCreated,
  })

  // When streaming completes, navigate properly to the session route.
  // Small delay allows queued messages to start before we navigate.
  useEffect(() => {
    if (status === 'done' && pendingSessionIdRef.current) {
      const timer = setTimeout(() => {
        if (pendingSessionIdRef.current) {
          const sessionId = pendingSessionIdRef.current
          pendingSessionIdRef.current = null
          navigate({ to: '/$sessionId', params: { sessionId }, replace: true })
        }
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [status, navigate])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ChatMessages messages={messages} status={status} memoryContext={memoryContext} onRetry={retryLast} />
      <ChatInput
        onSend={sendMessage}
        onStop={stopStreaming}
        isStreaming={status === 'streaming'}
      />
    </div>
  )
}
