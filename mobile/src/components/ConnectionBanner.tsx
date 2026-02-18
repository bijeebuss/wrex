import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { wsManager, type ConnectionStatus } from '../api/websocket'
import { useTheme } from '../hooks/useTheme'

export function ConnectionBanner() {
  const [status, setStatus] = useState<ConnectionStatus>(wsManager.status)
  const theme = useTheme()

  useEffect(() => {
    return wsManager.onStatus(setStatus)
  }, [])

  if (status === 'connected') return null

  const label =
    status === 'connecting' ? 'Connecting...' :
    status === 'reconnecting' ? 'Reconnecting...' :
    'Disconnected'

  return (
    <View style={[styles.banner, { backgroundColor: theme.disconnectedBg }]}>
      <Text style={[styles.text, { color: theme.disconnectedText }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
})
