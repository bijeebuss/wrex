import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { useTheme } from '../hooks/useTheme'
import type { SessionListItem } from '../types'

interface SessionItemProps {
  session: SessionListItem
  onPress: () => void
  onDelete: () => void
  isActive: boolean
}

export function SessionItem({ session, onPress, onDelete, isActive }: SessionItemProps) {
  const theme = useTheme()

  const handleLongPress = () => {
    Alert.alert(
      'Delete Session',
      `Delete "${session.title || 'Untitled'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ],
    )
  }

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: isActive ? theme.surfaceHover : 'transparent' },
      ]}
      onPress={onPress}
      onLongPress={handleLongPress}
    >
      <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
        {session.title || 'Untitled'}
      </Text>
      {session.lastMessageSnippet ? (
        <Text style={[styles.snippet, { color: theme.textMuted }]} numberOfLines={1}>
          {session.lastMessageSnippet}
        </Text>
      ) : null}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 8,
    marginVertical: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  snippet: {
    fontSize: 12,
    marginTop: 2,
  },
})
