import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../hooks/useTheme'
import type { ToolCallState } from '../types'

interface ToolBlockProps {
  tool: ToolCallState
}

export function ToolBlock({ tool }: ToolBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const theme = useTheme()

  const statusIcon = tool.status === 'running' ? '⟳' : '✓'

  return (
    <View style={[styles.container, { backgroundColor: theme.toolBg, borderColor: theme.toolBorder }]}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.header}>
        <Text style={[styles.statusIcon, { color: tool.status === 'running' ? theme.warning : theme.success }]}>
          {statusIcon}
        </Text>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {tool.name}
        </Text>
        <Text style={[styles.chevron, { color: theme.textMuted }]}>
          {expanded ? '▾' : '▸'}
        </Text>
      </TouchableOpacity>
      {expanded && tool.input ? (
        <View style={[styles.inputContainer, { borderTopColor: theme.toolBorder }]}>
          <Text style={[styles.input, { color: theme.textSecondary }]} selectable>
            {tool.input}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 4,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  name: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  chevron: {
    fontSize: 12,
    marginLeft: 4,
  },
  inputContainer: {
    borderTopWidth: 1,
    padding: 10,
  },
  input: {
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
})
