import { memo } from 'react'
import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import type { ChatMessage as ChatMessageType } from '../../types/chat'
import { ToolBlock } from './ToolBlock'
import { ErrorBubble } from './ErrorBubble'

interface ChatMessageProps {
  message: ChatMessageType
  onRetry: () => void
}

const plugins = { code }

function ChatMessageInner({ message, onRetry }: ChatMessageProps) {
  // Error state - show error bubble
  if (message.error) {
    return <ErrorBubble message={message.error} onRetry={onRetry} />
  }

  // User message
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-(--color-user-bubble-light) dark:bg-(--color-user-bubble) text-gray-900 dark:text-white">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</p>
        </div>
      </div>
    )
  }

  // Assistant message — hide bubble until there's content to show
  if (!message.content && (!message.toolCalls || message.toolCalls.length === 0)) {
    return null
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-(--color-claude-bubble-light) dark:bg-(--color-claude-bubble)">
        {message.content && (
          <div className="text-[15px] leading-relaxed text-gray-900 dark:text-gray-100 prose dark:prose-invert max-w-none prose-code:text-sm">
            <Streamdown
              plugins={plugins}
              isAnimating={message.isStreaming}
            >
              {message.content}
            </Streamdown>
          </div>
        )}
        {message.toolCalls?.map(tool => (
          <ToolBlock key={tool.id} tool={tool} />
        ))}
        {message.isStreaming && (
          <div className="flex gap-1 pt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  )
}

export const ChatMessage = memo(ChatMessageInner, (prevProps, nextProps) => {
  const prev = prevProps.message
  const next = nextProps.message
  // Only re-render if the message actually changed
  return (
    prev.id === next.id &&
    prev.content === next.content &&
    prev.isStreaming === next.isStreaming &&
    prev.error === next.error &&
    prev.toolCalls === next.toolCalls
  )
})
