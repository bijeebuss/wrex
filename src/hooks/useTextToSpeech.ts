import { useEffect, useRef, useCallback } from 'react'

/**
 * Watches streaming assistant text and speaks it aloud using server-side
 * Kokoro TTS with streaming audio delivery.
 *
 * The server splits text into sentences and streams back WAV chunks as each
 * sentence is synthesized. The client plays each chunk immediately, so the
 * first sentence is audible while later sentences are still generating.
 *
 * Only active when `enabled` is true (i.e. mic is listening).
 */
export function useTextToSpeech(content: string, isStreaming: boolean, enabled: boolean) {
  const spokenIndexRef = useRef(0)
  const textQueueRef = useRef<string[]>([])
  const audioQueueRef = useRef<AudioBuffer[]>([])
  const fetchingRef = useRef(false)
  const playingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }, [])

  // Play next audio buffer from the queue
  const playAudioNext = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      playingRef.current = false
      return
    }

    playingRef.current = true
    const audioBuffer = audioQueueRef.current.shift()!
    const ctx = getAudioContext()
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    sourceNodeRef.current = source

    source.onended = () => {
      sourceNodeRef.current = null
      playAudioNext()
    }

    source.start()
  }, [getAudioContext])

  // Start playing if not already playing (called when new audio is queued)
  const maybeStartPlayback = useCallback(() => {
    if (!playingRef.current && audioQueueRef.current.length > 0) {
      playAudioNext()
    }
  }, [playAudioNext])

  // Process text queue: fetch streaming TTS for the next text chunk
  const processTextQueue = useCallback(async () => {
    if (fetchingRef.current || textQueueRef.current.length === 0) return

    fetchingRef.current = true
    const text = textQueueRef.current.shift()!

    try {
      const controller = new AbortController()
      abortRef.current = controller

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        console.error('[tts] Server error:', res.status)
        fetchingRef.current = false
        processTextQueue()
        return
      }

      const reader = res.body.getReader()
      const ctx = getAudioContext()
      let buffer = new Uint8Array(0)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Append new data to buffer
        const newBuffer = new Uint8Array(buffer.length + value.length)
        newBuffer.set(buffer)
        newBuffer.set(value, buffer.length)
        buffer = newBuffer

        // Parse complete frames: 4-byte LE length + WAV data
        while (buffer.length >= 4) {
          const chunkLen = new DataView(buffer.buffer, buffer.byteOffset).getUint32(0, true)
          if (buffer.length < 4 + chunkLen) break // incomplete frame

          const wavData = buffer.slice(4, 4 + chunkLen)
          buffer = buffer.slice(4 + chunkLen)

          // Decode WAV and queue for playback
          const audioBuffer = await ctx.decodeAudioData(wavData.buffer.slice(
            wavData.byteOffset,
            wavData.byteOffset + wavData.byteLength,
          ))
          audioQueueRef.current.push(audioBuffer)
          maybeStartPlayback()
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      console.error('[tts] Stream error:', err)
    }

    fetchingRef.current = false
    processTextQueue()
  }, [getAudioContext, maybeStartPlayback])

  const cancelAll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    abortRef.current = null
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null
      sourceNodeRef.current.stop()
      sourceNodeRef.current = null
    }
    textQueueRef.current = []
    audioQueueRef.current = []
    fetchingRef.current = false
    playingRef.current = false
  }, [])

  const MAX_CHARS = 1500
  const SENTENCE_RE = /[.!?](?:\s|$)|\n/g

  const enqueue = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    textQueueRef.current.push(trimmed)
    if (!fetchingRef.current) {
      processTextQueue()
    }
  }, [processTextQueue])

  // Flush unspoken text up to the last sentence boundary within MAX_CHARS.
  // When force=true (stream ended), send everything — the server handles
  // sentence splitting internally via tts.stream().
  const flush = useCallback((text: string, force: boolean): number => {
    if (!text.trim()) return 0

    // When forced (stream ended), send all remaining text in one go
    if (force) {
      enqueue(text)
      return text.length
    }

    let lastBoundary = -1
    SENTENCE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = SENTENCE_RE.exec(text)) !== null) {
      const end = match.index + match[0].length
      if (end <= MAX_CHARS) {
        lastBoundary = end
      }
    }

    if (lastBoundary > 0) {
      enqueue(text.slice(0, lastBoundary))
      return lastBoundary
    }

    if (text.length >= MAX_CHARS) {
      enqueue(text)
      return text.length
    }

    return 0
  }, [enqueue])

  // Debounce: wait 1s after last token, then flush up to sentence boundary
  useEffect(() => {
    if (!enabled || !content || !isStreaming) return

    const unspoken = content.slice(spokenIndexRef.current)
    if (!unspoken.trim()) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const text = content.slice(spokenIndexRef.current)
      const flushed = flush(text, false)
      if (flushed > 0) {
        spokenIndexRef.current += flushed
      }
    }, 1000)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [content, enabled, isStreaming, flush])

  // When streaming ends, flush any remaining text immediately
  useEffect(() => {
    if (!enabled || isStreaming) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const remaining = content.slice(spokenIndexRef.current)
    const flushed = flush(remaining, true)
    if (flushed > 0) {
      spokenIndexRef.current += flushed
    }
  }, [isStreaming, content, enabled, flush])

  // Reset spoken index when a new message starts streaming
  useEffect(() => {
    if (isStreaming && content === '') {
      spokenIndexRef.current = 0
    }
  }, [isStreaming, content])

  // Cancel playback when disabled
  useEffect(() => {
    if (!enabled) {
      cancelAll()
    }
  }, [enabled, cancelAll])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAll()
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
        audioCtxRef.current = null
      }
    }
  }, [cancelAll])
}
