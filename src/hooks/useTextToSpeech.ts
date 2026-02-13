import { useEffect, useRef, useCallback } from 'react'

/**
 * Watches streaming assistant text and speaks it aloud sentence-by-sentence.
 * Only active when `enabled` is true (i.e. mic is listening).
 * Skips tool call content — only speaks message.content.
 */
export function useTextToSpeech(content: string, isStreaming: boolean, enabled: boolean) {
  const spokenIndexRef = useRef(0)
  const utteranceQueueRef = useRef<SpeechSynthesisUtterance[]>([])
  const speakingRef = useRef(false)

  // Sentence boundary: . ! ? followed by space/newline/end, or a newline
  const SENTENCE_RE = /[.!?](?:\s|$)|\n/g

  const speakNext = useCallback(() => {
    if (utteranceQueueRef.current.length === 0) {
      speakingRef.current = false
      return
    }
    speakingRef.current = true
    const utterance = utteranceQueueRef.current.shift()!
    utterance.onend = () => speakNext()
    utterance.onerror = () => speakNext()
    window.speechSynthesis.speak(utterance)
  }, [])

  const queueText = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const utterance = new SpeechSynthesisUtterance(trimmed)
    utterance.rate = 1.1
    utteranceQueueRef.current.push(utterance)
    if (!speakingRef.current) {
      speakNext()
    }
  }, [speakNext])

  // Process new content as it streams in
  useEffect(() => {
    if (!enabled || !content) return

    const unspoken = content.slice(spokenIndexRef.current)
    if (!unspoken) return

    // Find sentence boundaries in the unspoken portion
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

  // Cancel speech when disabled or on unmount
  useEffect(() => {
    if (!enabled) {
      window.speechSynthesis.cancel()
      utteranceQueueRef.current = []
      speakingRef.current = false
    }
  }, [enabled])

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel()
      utteranceQueueRef.current = []
      speakingRef.current = false
    }
  }, [])
}
