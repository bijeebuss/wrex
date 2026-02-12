import type { ChatMessage as ChatMessageType, ChatStatus, MemorySnippet } from '../../types/chat'
import { ChatMessage } from './ChatMessage'
import { MemoryContext } from './MemoryContext'
import { LoadingIndicator } from '../ui/LoadingIndicator'
import { useAutoScroll } from '../../hooks/useAutoScroll'

interface ChatMessagesProps {
  messages: ChatMessageType[]
  status: ChatStatus
  memoryContext?: MemorySnippet[] | null
  onRetry: () => void
}

export function ChatMessages({ messages, status, memoryContext, onRetry }: ChatMessagesProps) {
  const isStreaming = status === 'streaming'
  const { containerRef, showScrollButton, scrollToBottom, latestMessageRef } = useAutoScroll({
    messages,
    isStreaming,
  })

  // Show loading indicator when streaming and last assistant message has no content yet
  const lastMsg = messages[messages.length - 1]
  const showLoading = isStreaming && lastMsg?.role === 'assistant' && !lastMsg.content && !lastMsg.error

  // Find the index of the last assistant message for the sentinel ref
  let lastAssistantIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') { lastAssistantIdx = i; break }
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-4 py-6"
      >
        <div className="max-w-3xl mx-auto">
          {memoryContext && memoryContext.length > 0 && (
            <MemoryContext snippets={memoryContext} />
          )}
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <div className="text-center text-gray-400 dark:text-gray-600">
                {/* Empty state -- just the input is ready */}
              </div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={msg.id}
              ref={idx === lastAssistantIdx ? latestMessageRef : undefined}
            >
              <ChatMessage message={msg} onRetry={onRetry} />
            </div>
          ))}
          {showLoading && <LoadingIndicator />}
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 shadow-lg flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          aria-label="Scroll to bottom"
        >
          <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
    </div>
  )
}
