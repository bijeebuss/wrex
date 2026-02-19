import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useChat } from '@/hooks/useChat'
import { ChatMessages } from '@/components/chat/ChatMessages'
import { ChatInput } from '@/components/chat/ChatInput'
import { ContextBar } from '@/components/chat/ContextBar'
import { useTextToSpeech } from '@/hooks/useTextToSpeech'
import { useProcessingChime } from '@/hooks/useProcessingChime'
import removeMarkdown from 'remove-markdown'
import { loadSessionMessages } from '@/lib/api/sessions'
import type { ChatMessage } from '@/types/chat'
import { useVoiceMode } from '@/lib/voice-mode-context'

// Module-level flag to carry voice mode across navigations
let pendingVoiceStart = false

export const Route = createFileRoute('/_chat/$sessionId')({
  loader: async ({ params }) => {
    try {
      const data = await loadSessionMessages({
        data: { sessionId: params.sessionId },
      })
      return data
    } catch {
      // Session doesn't exist yet (new chat with pre-generated ID)
      return { id: params.sessionId, title: null, claudeSessionId: null, messages: [] }
    }
  },
  component: ChatSession,
})

// Wrapper that keys on sessionId to force full remount (resets all hook state)
function ChatSession() {
  const { sessionId } = Route.useParams()
  return <ChatSessionInner key={sessionId} />
}

function ChatSessionInner() {
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

  const { messages, status, memoryContext, contextUsage, sendMessage, stopStreaming, retryLast } = useChat({
    sessionId,
    initialMessages,
    onSessionCreated: handleSessionCreated,
  })

  const [isListening, setIsListening] = useState(false)
  const { setIsVoiceMode } = useVoiceMode()
  const [autoStartVoice] = useState(() => {
    if (pendingVoiceStart) {
      pendingVoiceStart = false
      return true
    }
    return false
  })

  useEffect(() => {
    setIsVoiceMode(isListening)
    return () => setIsVoiceMode(false)
  }, [isListening, setIsVoiceMode])

  // Get the last assistant message's content for TTS
  const lastMsg = messages[messages.length - 1]
  const ttsContent = lastMsg?.role === 'assistant' ? removeMarkdown(lastMsg.content) : ''
  const ttsStreaming = lastMsg?.role === 'assistant' && !!lastMsg.isStreaming

  const { cancelAll } = useTextToSpeech(ttsContent, ttsStreaming, isListening)
  useProcessingChime(status === 'streaming', isListening)

  const navigate = useNavigate()
  const handleNewChat = useCallback(() => {
    if (isListening) {
      pendingVoiceStart = true
    }
    navigate({ to: '/$sessionId', params: { sessionId: crypto.randomUUID() } })
  }, [navigate, isListening])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ChatMessages messages={messages} status={status} memoryContext={memoryContext} onRetry={retryLast} isVoiceMode={isListening} />
      <ContextBar contextUsage={contextUsage} />
      <ChatInput
        onSend={sendMessage}
        onStop={stopStreaming}
        isStreaming={status === 'streaming'}
        onListeningChange={setIsListening}
        onStopTTS={cancelAll}
        onNewChat={handleNewChat}
        autoStartVoice={autoStartVoice}
      />
    </div>
  )
}
