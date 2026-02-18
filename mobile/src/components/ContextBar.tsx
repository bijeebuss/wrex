import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../hooks/useTheme'
import type { ContextUsage } from '../types'

const MAX_TOKENS = 200_000

interface ContextBarProps {
  usage: ContextUsage | null
}

export function ContextBar({ usage }: ContextBarProps) {
  const theme = useTheme()

  if (!usage) return null

  const total = usage.inputTokens + usage.outputTokens
  const pct = Math.min((total / MAX_TOKENS) * 100, 100)
  const label = `${Math.round(total / 1000)}k / ${MAX_TOKENS / 1000}k tokens`

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      <View style={[styles.bar, { backgroundColor: theme.contextBar }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.contextFill }]} />
      </View>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  bar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  label: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'right',
  },
})
