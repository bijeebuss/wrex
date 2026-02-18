import React, { useRef, useCallback } from 'react'
import { FlatList, StyleSheet } from 'react-native'
import { ChatMessage } from './ChatMessage'
import { useTheme } from '../hooks/useTheme'
import type { ChatMessage as ChatMessageType } from '../types'

interface ChatMessagesProps {
  messages: ChatMessageType[]
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  const flatListRef = useRef<FlatList>(null)
  const theme = useTheme()

  const onContentSizeChange = useCallback(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true })
    }
  }, [messages.length])

  const renderItem = useCallback(({ item }: { item: ChatMessageType }) => (
    <ChatMessage message={item} />
  ), [])

  const keyExtractor = useCallback((item: ChatMessageType) => item.id, [])

  return (
    <FlatList
      ref={flatListRef}
      data={messages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onContentSizeChange={onContentSizeChange}
      contentContainerStyle={[styles.content, { backgroundColor: theme.background }]}
      style={{ backgroundColor: theme.background }}
      showsVerticalScrollIndicator={false}
    />
  )
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: 12,
    flexGrow: 1,
  },
})
