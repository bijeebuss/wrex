import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { useTheme } from '../hooks/useTheme'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import type { ChatStatus } from '../types'

const SEND_KEYWORD = /\s*send (a )?message\.?$/i

interface ChatInputProps {
  onSend: (text: string) => void
  onStop: () => void
  status: ChatStatus
  onListeningChange?: (listening: boolean) => void
}

export function ChatInput({ onSend, onStop, status, onListeningChange }: ChatInputProps) {
  const [text, setText] = useState('')
  const theme = useTheme()
  const isStreaming = status === 'streaming'
  const textRef = useRef('')
  const pulseAnim = useRef(new Animated.Value(1)).current

  // Track the text that existed before dictation started
  const baseTextRef = useRef('')
  // After a voice-send, block all results until the engine restarts fresh
  const sentRef = useRef(false)
  const requestRestartRef = useRef<() => void>()

  useEffect(() => {
    textRef.current = text
  }, [text])

  const handleTranscript = useCallback(({ transcript, isFinal }: { transcript: string; isFinal: boolean }) => {
    // After a voice-send, block all results — engine is restarting
    if (sentRef.current) return

    const base = baseTextRef.current
    const spacer = base && !base.endsWith(' ') ? ' ' : ''
    const combined = base + spacer + transcript.trim()

    if (SEND_KEYWORD.test(combined)) {
      const message = combined.replace(SEND_KEYWORD, '').trim()
      if (message) {
        sentRef.current = true
        onSend(message)
        setText('')
        baseTextRef.current = ''
        // Stop the engine — voiceMode auto-restart will give us a fresh session.
        // sentRef gets cleared by onSessionEnd when the old session ends.
        requestRestartRef.current?.()
      }
    } else {
      setText(combined)
      if (isFinal) {
        baseTextRef.current = combined
      }
    }
  }, [onSend])

  // When the engine session ends (old session torn down), clear the send guard
  // so the fresh session's results flow through
  const handleSessionEnd = useCallback(() => {
    sentRef.current = false
    baseTextRef.current = ''
  }, [])

  const { isListening, toggle, requestRestart } = useSpeechRecognition({
    onTranscript: handleTranscript,
    onSessionEnd: handleSessionEnd,
  })
  requestRestartRef.current = requestRestart

  // Snapshot base text when dictation starts, reset when it stops
  useEffect(() => {
    if (isListening) {
      baseTextRef.current = textRef.current
    }
  }, [isListening])

  // Notify parent of listening state changes (for TTS)
  useEffect(() => {
    onListeningChange?.(isListening)
  }, [isListening, onListeningChange])

  // Pulse animation when listening
  useEffect(() => {
    if (isListening) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      )
      animation.start()
      return () => animation.stop()
    } else {
      pulseAnim.setValue(1)
    }
  }, [isListening, pulseAnim])

  const handleSend = () => {
    if (text.trim()) {
      onSend(text)
      setText('')
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={[styles.container, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <TextInput
          style={[styles.input, {
            backgroundColor: theme.background,
            color: theme.text,
            borderColor: theme.border,
          }]}
          value={text}
          onChangeText={setText}
          placeholder="Message Wrex..."
          placeholderTextColor={theme.textMuted}
          multiline
          maxLength={10000}
          returnKeyType="default"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
        />
        {!isStreaming && (
          <Animated.View style={{ opacity: pulseAnim }}>
            <TouchableOpacity
              style={[
                styles.roundButton,
                isListening
                  ? styles.micActiveButton
                  : { backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border },
              ]}
              onPress={toggle}
              accessibilityLabel={isListening ? 'Stop dictation' : 'Start dictation'}
            >
              <Svg width={16} height={16} viewBox="0 0 24 24" fill={isListening ? '#ffffff' : theme.textMuted}>
                <Path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
                <Path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V20H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.07A7 7 0 0 0 19 11z" />
              </Svg>
            </TouchableOpacity>
          </Animated.View>
        )}
        {isStreaming ? (
          <TouchableOpacity style={[styles.roundButton, styles.stopButton]} onPress={onStop}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="#ffffff">
              <Rect x="6" y="6" width="12" height="12" rx="2" />
            </Svg>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.roundButton, { backgroundColor: theme.primary, opacity: text.trim() ? 1 : 0.5 }]}
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Text style={[styles.buttonText, { color: theme.primaryText }]}>Send</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 40,
  },
  roundButton: {
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micActiveButton: {
    backgroundColor: '#ef4444',
  },
  stopButton: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
})
