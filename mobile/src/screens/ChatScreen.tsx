import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { DrawerNavigationProp } from '@react-navigation/drawer'
import { useTheme } from '../hooks/useTheme'
import { ChatMessages } from '../components/ChatMessages'
import { ChatInput } from '../components/ChatInput'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { ContextBar } from '../components/ContextBar'
import { MemoryContext } from '../components/MemoryContext'
import { useChat } from '../hooks/useChat'
import { useTextToSpeech } from '../hooks/useTextToSpeech'
import { fetchSession } from '../api/client'
import type { ChatMessage } from '../types'

type RootDrawerParamList = {
  Chat: { sessionId?: string }
}

type ChatScreenRouteProp = RouteProp<RootDrawerParamList, 'Chat'>

export function ChatScreen() {
  const navigation = useNavigation<DrawerNavigationProp<RootDrawerParamList>>()
  const route = useRoute<ChatScreenRouteProp>()
  const sessionId = route.params?.sessionId
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const [initialMessages, setInitialMessages] = useState<ChatMessage[] | undefined>(undefined)
  const [loadedSessionId, setLoadedSessionId] = useState<string | undefined>(undefined)

  // Load existing session messages
  useEffect(() => {
    if (sessionId && sessionId !== loadedSessionId) {
      fetchSession(sessionId)
        .then(session => {
          const msgs: ChatMessage[] = session.messages.map(m => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }))
          setInitialMessages(msgs)
          setLoadedSessionId(sessionId)
        })
        .catch(() => {
          setInitialMessages([])
          setLoadedSessionId(sessionId)
        })
    } else if (!sessionId) {
      setInitialMessages([])
      setLoadedSessionId(undefined)
    }
  }, [sessionId, loadedSessionId])

  const handleSessionCreated = useCallback((id: string) => {
    navigation.setParams({ sessionId: id })
  }, [navigation])

  const [isListening, setIsListening] = useState(false)

  const {
    messages,
    status,
    error,
    memoryContext,
    contextUsage,
    sendMessage,
    stopStreaming,
  } = useChat({
    sessionId,
    onSessionCreated: handleSessionCreated,
    initialMessages: initialMessages ?? [],
  })

  // Extract last assistant message for TTS
  const { ttsContent, ttsStreaming } = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return { ttsContent: messages[i].content, ttsStreaming: !!messages[i].isStreaming }
      }
    }
    return { ttsContent: '', ttsStreaming: false }
  }, [messages])

  useTextToSpeech(ttsContent, ttsStreaming, isListening)

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingBottom: insets.bottom }]}>
      <ConnectionBanner />
      {memoryContext ? <MemoryContext snippets={memoryContext} /> : null}
      <ChatMessages messages={messages} />
      <ContextBar usage={contextUsage} />
      <ChatInput onSend={sendMessage} onStop={stopStreaming} status={status} onListeningChange={setIsListening} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
