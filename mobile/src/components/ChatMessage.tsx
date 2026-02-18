import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Markdown from 'react-native-markdown-display'
import { useTheme } from '../hooks/useTheme'
import { ToolBlock } from './ToolBlock'
import type { ChatMessage as ChatMessageType } from '../types'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const theme = useTheme()
  const isUser = message.role === 'user'

  const markdownStyles = {
    body: {
      color: isUser ? theme.userBubbleText : theme.assistantBubbleText,
      fontSize: 15,
      lineHeight: 22,
    },
    code_inline: {
      backgroundColor: isUser ? 'rgba(255,255,255,0.15)' : theme.surface,
      color: isUser ? theme.userBubbleText : theme.text,
      fontSize: 13,
      fontFamily: 'monospace',
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    fence: {
      backgroundColor: isUser ? 'rgba(255,255,255,0.1)' : theme.surface,
      color: isUser ? theme.userBubbleText : theme.text,
      fontSize: 13,
      fontFamily: 'monospace',
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
    },
    link: {
      color: isUser ? '#bfdbfe' : theme.primary,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
    },
  }

  return (
    <View style={[styles.row, isUser ? styles.userRow : styles.assistantRow]}>
      <View style={[
        styles.bubble,
        isUser
          ? { backgroundColor: theme.userBubble }
          : { backgroundColor: theme.assistantBubble },
      ]}>
        {isUser ? (
          <Text style={{ color: theme.userBubbleText, fontSize: 15, lineHeight: 22 }}>
            {message.content}
          </Text>
        ) : (
          <>
            {message.content ? (
              <Markdown style={markdownStyles}>
                {message.content}
              </Markdown>
            ) : null}
            {message.toolCalls?.map(tool => (
              <ToolBlock key={tool.id} tool={tool} />
            ))}
            {message.isStreaming && !message.content && !message.toolCalls?.length ? (
              <Text style={[styles.thinking, { color: theme.textMuted }]}>Thinking...</Text>
            ) : null}
          </>
        )}
        {message.error ? (
          <View style={[styles.errorBadge, { backgroundColor: theme.errorBg }]}>
            <Text style={{ color: theme.error, fontSize: 13 }}>{message.error}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    marginVertical: 4,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  assistantRow: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  thinking: {
    fontStyle: 'italic',
    fontSize: 14,
  },
  errorBadge: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
  },
})
