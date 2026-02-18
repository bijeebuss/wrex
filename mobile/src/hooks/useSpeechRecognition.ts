import { useState, useCallback, useRef, useEffect } from 'react'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'

interface TranscriptEvent {
  transcript: string
  isFinal: boolean
}

interface SpeechRecognitionOptions {
  onTranscript: (event: TranscriptEvent) => void
  onSessionEnd?: () => void
}

export function useSpeechRecognition({ onTranscript, onSessionEnd }: SpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false)
  const onTranscriptRef = useRef(onTranscript)
  const onSessionEndRef = useRef(onSessionEnd)
  // User intent — true when user has toggled voice mode on, stays true
  // even if the engine temporarily stops between utterances
  const voiceModeRef = useRef(false)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    onSessionEndRef.current = onSessionEnd
  }, [onSessionEnd])

  const startEngine = useCallback(() => {
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      continuous: true,
      interimResults: true,
      addsPunctuation: true,
      iosCategory: {
        category: 'playAndRecord',
        categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
        mode: 'measurement',
      },
    })
  }, [])

  useSpeechRecognitionEvent('result', (event) => {
    if (event.results.length > 0) {
      onTranscriptRef.current({
        transcript: event.results[0].transcript,
        isFinal: event.isFinal,
      })
    }
  })

  useSpeechRecognitionEvent('end', () => {
    // Notify consumer that the old session is done (clears stale-result guards)
    onSessionEndRef.current?.()
    if (voiceModeRef.current) {
      // Engine stopped but user still wants voice mode — restart
      // clearTimeout prevents multiple overlapping restarts from rapid end events
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = setTimeout(() => {
        if (voiceModeRef.current) {
          startEngine()
        }
      }, 300)
    } else {
      setIsListening(false)
    }
  })

  useSpeechRecognitionEvent('error', (event) => {
    console.warn('SpeechRecognition error:', event.error, event.message)
    onSessionEndRef.current?.()
    if (voiceModeRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = setTimeout(() => {
        if (voiceModeRef.current) {
          startEngine()
        }
      }, 500)
    } else {
      setIsListening(false)
    }
  })

  const toggle = useCallback(async () => {
    if (voiceModeRef.current) {
      voiceModeRef.current = false
      clearTimeout(restartTimerRef.current)
      ExpoSpeechRecognitionModule.stop()
      // isListening will be set to false by the 'end' event
      return
    }

    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (!granted) {
      console.warn('Speech recognition permission not granted')
      return
    }

    voiceModeRef.current = true
    setIsListening(true)
    startEngine()
  }, [startEngine])

  // Stop the engine but keep voice mode on — the 'end' handler will auto-restart
  const requestRestart = useCallback(() => {
    ExpoSpeechRecognitionModule.stop()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      voiceModeRef.current = false
      clearTimeout(restartTimerRef.current)
      ExpoSpeechRecognitionModule.stop()
    }
  }, [])

  return { isListening, toggle, requestRestart }
}
