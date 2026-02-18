import React, { useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native'
import { type DrawerContentComponentProps } from '@react-navigation/drawer'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../hooks/useTheme'
import { SessionItem } from './SessionItem'
import { useSessions } from '../hooks/useSessions'
import { getServerUrlSync, setServerUrl } from '../config'
import type { SessionListItem } from '../types'

interface SessionDrawerProps extends DrawerContentComponentProps {
  currentSessionId?: string
  onNewChat: () => void
  onSelectSession: (sessionId: string) => void
}

export function SessionDrawer({ currentSessionId, onNewChat, onSelectSession, ...props }: SessionDrawerProps) {
  const { sessions, loading, refresh, deleteSession } = useSessions()
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const handleServerSettings = useCallback(() => {
    Alert.prompt(
      'Server URL',
      'Enter the Wrex server URL:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (url?: string) => {
            if (url?.trim()) {
              setServerUrl(url.trim())
            }
          },
        },
      ],
      'plain-text',
      getServerUrlSync(),
    )
  }, [])

  const renderItem = useCallback(({ item }: { item: SessionListItem }) => (
    <SessionItem
      session={item}
      isActive={item.id === currentSessionId}
      onPress={() => onSelectSession(item.id)}
      onDelete={() => deleteSession(item.id)}
    />
  ), [currentSessionId, onSelectSession, deleteSession])

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <TouchableOpacity
        style={[styles.newChatButton, { backgroundColor: theme.primary }]}
        onPress={onNewChat}
      >
        <Text style={[styles.newChatText, { color: theme.primaryText }]}>New Chat</Text>
      </TouchableOpacity>

      <FlatList
        data={sessions}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        style={styles.list}
        refreshing={loading}
        onRefresh={refresh}
      />

      <TouchableOpacity
        style={[styles.settingsButton, { borderTopColor: theme.border }]}
        onPress={handleServerSettings}
      >
        <Text style={[styles.settingsText, { color: theme.textSecondary }]}>Server Settings</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  newChatButton: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  newChatText: {
    fontSize: 15,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  settingsButton: {
    borderTopWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  settingsText: {
    fontSize: 14,
  },
})
