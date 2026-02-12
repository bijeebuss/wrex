import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'
import { useChat } from '@/hooks/useChat'
import { ChatMessages } from '@/components/chat/ChatMessages'
import { ChatInput } from '@/components/chat/ChatInput'

export const Route = createFileRoute('/_chat/')({
  component: NewChat,
})

function NewChat() {
  const navigate = useNavigate()
  const router = useRouter()

  const handleSessionCreated = useCallback(
    (id: string) => {
      // Navigate to the new session route and refresh sidebar
      navigate({ to: '/$sessionId', params: { sessionId: id } })
      router.invalidate()
    },
    [navigate, router],
  )

  const { messages, status, sendMessage, stopStreaming, retryLast } = useChat({
    onSessionCreated: handleSessionCreated,
  })

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ChatMessages messages={messages} status={status} onRetry={retryLast} />
      <ChatInput
        onSend={sendMessage}
        onStop={stopStreaming}
        isStreaming={status === 'streaming'}
      />
    </div>
  )
}
