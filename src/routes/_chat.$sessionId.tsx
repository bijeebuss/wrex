import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { useChat } from '@/hooks/useChat'
import { ChatMessages } from '@/components/chat/ChatMessages'
import { ChatInput } from '@/components/chat/ChatInput'
import { loadSessionMessages } from '@/lib/api/sessions'
import type { ChatMessage } from '@/types/chat'

export const Route = createFileRoute('/_chat/$sessionId')({
  loader: async ({ params }) => {
    const data = await loadSessionMessages({
      data: { sessionId: params.sessionId },
    })
    return data
  },
  component: ChatSession,
})

function ChatSession() {
  const { sessionId } = Route.useParams()
  const loaderData = Route.useLoaderData()
  const router = useRouter()

  // Map loaded messages to ChatMessage format
  const initialMessages: ChatMessage[] = useMemo(
    () =>
      loaderData.messages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    [loaderData.messages],
  )

  const handleSessionCreated = useCallback(() => {
    // Refresh sidebar when messages are sent in this session
    router.invalidate()
  }, [router])

  const { messages, status, sendMessage, stopStreaming, retryLast } = useChat({
    sessionId,
    initialMessages,
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
