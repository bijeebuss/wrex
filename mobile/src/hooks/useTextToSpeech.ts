import { useEffect, useRef, useCallback } from 'react'
import * as Speech from 'expo-speech'

/**
 * Watches streaming assistant text and speaks it aloud sentence-by-sentence.
 * Only active when `enabled` is true (i.e. mic is listening).
 */
export function useTextToSpeech(content: string, isStreaming: boolean, enabled: boolean) {
  const spokenIndexRef = useRef(0)
  const queueRef = useRef<string[]>([])
  const speakingRef = useRef(false)

  const SENTENCE_RE = /[.!?](?:\s|$)|\n/g

  const speakNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      speakingRef.current = false
      return
    }
    speakingRef.current = true
    const text = queueRef.current.shift()!
    Speech.speak(text, {
      rate: 1.1,
      onDone: () => speakNext(),
      onError: () => speakNext(),
    })
  }, [])

  const queueText = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    queueRef.current.push(trimmed)
    if (!speakingRef.current) {
      speakNext()
    }
  }, [speakNext])

  // Process new content as it streams in
  useEffect(() => {
    if (!enabled || !content) return

    const unspoken = content.slice(spokenIndexRef.current)
    if (!unspoken) return

    let lastBoundary = -1
    SENTENCE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = SENTENCE_RE.exec(unspoken)) !== null) {
      lastBoundary = match.index + match[0].length
    }

    if (lastBoundary > 0) {
      const toSpeak = unspoken.slice(0, lastBoundary)
      spokenIndexRef.current += lastBoundary
      queueText(toSpeak)
    }
  }, [content, enabled, queueText])

  // When streaming ends, speak any remaining unspoken text
  useEffect(() => {
    if (!enabled || isStreaming) return

    const remaining = content.slice(spokenIndexRef.current)
    if (remaining.trim()) {
      spokenIndexRef.current = content.length
      queueText(remaining)
    }
  }, [isStreaming, content, enabled, queueText])

  // Reset spoken index when a new message starts streaming
  useEffect(() => {
    if (isStreaming && content === '') {
      spokenIndexRef.current = 0
    }
  }, [isStreaming, content])

  // Cancel speech when disabled
  useEffect(() => {
    if (!enabled) {
      Speech.stop()
      queueRef.current = []
      speakingRef.current = false
    }
  }, [enabled])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Speech.stop()
      queueRef.current = []
      speakingRef.current = false
    }
  }, [])
}
