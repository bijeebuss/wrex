import { useEffect, useRef, useCallback } from 'react'

/**
 * Plays a repeating soft chime while a request is processing in voice mode.
 * Uses Web Audio API oscillators — no audio files needed.
 *
 * A gentle two-tone ascending chime loops on an interval to signal that
 * the user's voice input is being processed.
 */
export function useProcessingChime(isProcessing: boolean, enabled: boolean) {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }, [])

  const playChime = useCallback(() => {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    // Soft two-tone ascending chime
    const notes = [523.25, 659.25] // C5, E5 — a gentle major third
    const duration = 0.15
    const gap = 0.1

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.value = freq

      // Gentle envelope: quick fade in, soft fade out
      const start = now + i * (duration + gap)
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02) // soft attack
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration) // gentle decay

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration)
    })
  }, [getAudioContext])

  // Start/stop the repeating chime based on processing state
  useEffect(() => {
    if (enabled && isProcessing) {
      // Play immediately, then repeat every 2 seconds
      playChime()
      intervalRef.current = setInterval(playChime, 2000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isProcessing, enabled, playChime])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
        audioCtxRef.current = null
      }
    }
  }, [])
}
