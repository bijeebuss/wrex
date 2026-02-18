import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../hooks/useTheme'
import type { MemorySnippet } from '../types'

interface MemoryContextProps {
  snippets: MemorySnippet[]
}

export function MemoryContext({ snippets }: MemoryContextProps) {
  const [expanded, setExpanded] = useState(false)
  const theme = useTheme()

  return (
    <View style={[styles.container, { backgroundColor: theme.memoryBg, borderColor: theme.memoryBorder }]}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>
          Memory Context ({snippets.length})
        </Text>
        <Text style={[styles.chevron, { color: theme.textMuted }]}>
          {expanded ? '▾' : '▸'}
        </Text>
      </TouchableOpacity>
      {expanded && snippets.map((s, i) => (
        <View key={i} style={[styles.snippet, { borderTopColor: theme.memoryBorder }]}>
          <Text style={[styles.path, { color: theme.textMuted }]}>
            {s.filePath}:{s.startLine}-{s.endLine}
          </Text>
          <Text style={[styles.heading, { color: theme.text }]}>{s.heading}</Text>
          <Text style={[styles.content, { color: theme.textSecondary }]} numberOfLines={4}>
            {s.content}
          </Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 12,
  },
  snippet: {
    borderTopWidth: 1,
    padding: 12,
  },
  path: {
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  heading: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  content: {
    fontSize: 12,
    lineHeight: 18,
  },
})
