import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import { useChat } from '../hooks/useChat'
import { ChatMessages } from '../components/chat/ChatMessages'
import { ChatInput } from '../components/chat/ChatInput'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [sessionId, setSessionId] = useState<string | null>(null)

  const handleSessionCreated = useCallback((id: string) => {
    setSessionId(id)
  }, [])

  const { messages, status, sendMessage, stopStreaming, retryLast } = useChat({
    onSessionCreated: handleSessionCreated,
  })

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Wrex</h1>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              status === 'streaming'
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : status === 'done'
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                  : status === 'error'
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}
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
            <span className="text-[11px] opacity-40 font-mono">
              {sessionId.slice(0, 8)}...
            </span>
          )}
        </div>
      </header>

      {/* Messages area */}
      <ChatMessages messages={messages} status={status} onRetry={retryLast} />

      {/* Input area */}
      <ChatInput
        onSend={sendMessage}
        onStop={stopStreaming}
        isStreaming={status === 'streaming'}
      />
    </div>
  )
}
