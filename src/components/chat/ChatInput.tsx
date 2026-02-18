import { useState, useCallback, useRef, useEffect } from 'react'
import TextareaAutosize from 'react-textarea-autosize'

interface ChatInputProps {
  onSend: (text: string) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
  onListeningChange?: (listening: boolean) => void
}

function useSpeechRecognition(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const wantListeningRef = useRef(false)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    setSupported(!!SpeechRecognition)
  }, [])

  const startRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1]
      if (last.isFinal) {
        onTranscript(last[0].transcript)
      }
    }

    recognition.onend = () => {
      recognitionRef.current = null
      // Browser kills recognition after silence even with continuous=true.
      // Auto-restart if the user hasn't explicitly toggled off.
      if (wantListeningRef.current) {
        startRecognition()
      } else {
        setIsListening(false)
      }
    }

    recognition.onerror = (e) => {
      // "no-speech" is expected during silence — just let onend restart
      if (e.error === 'no-speech') return
      recognitionRef.current = null
      wantListeningRef.current = false
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [onTranscript])

  const toggle = useCallback(() => {
    if (isListening) {
      wantListeningRef.current = false
      recognitionRef.current?.stop()
      return
    }

    wantListeningRef.current = true
    startRecognition()
  }, [isListening, startRecognition])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wantListeningRef.current = false
      recognitionRef.current?.stop()
    }
  }, [])

  return { isListening, supported, toggle }
}

const SEND_KEYWORD = /\s*send (a )?message\.?$/i

export function ChatInput({ onSend, onStop, isStreaming, onListeningChange }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const valueRef = useRef('')

  // Keep ref in sync so voice callback always sees latest value
  useEffect(() => {
    valueRef.current = value
  }, [value])

  const handleTranscript = useCallback((text: string) => {
    const prev = valueRef.current
    const spacer = prev && !prev.endsWith(' ') ? ' ' : ''
    const combined = prev + spacer + text.trim()

    if (SEND_KEYWORD.test(combined)) {
      const message = combined.replace(SEND_KEYWORD, '').trim()
      if (message) {
        onSend(message)
        setValue('')
      }
    } else {
      setValue(combined)
      textareaRef.current?.focus()
    }
  }, [onSend])

  const { isListening, supported, toggle } = useSpeechRecognition(handleTranscript)

  // Notify parent of listening state changes (for TTS)
  useEffect(() => {
    onListeningChange?.(isListening)
  }, [isListening, onListeningChange])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
    // Refocus after sending
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [value, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-end gap-2">
        <TextareaAutosize
          ref={textareaRef}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Wrex..."
          minRows={1}
          maxRows={6}
          className="flex-1 resize-none rounded-2xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
        />
        {supported && !isStreaming && (
          <button
            type="button"
            onClick={toggle}
            className={`shrink-0 rounded-full w-10 h-10 flex items-center justify-center transition-colors cursor-pointer ${
              isListening
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                : 'bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}
            aria-label={isListening ? 'Stop dictation' : 'Start dictation'}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
              <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V20H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.07A7 7 0 0 0 19 11z" />
            </svg>
          </button>
        )}
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded-full w-10 h-10 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-colors cursor-pointer"
            aria-label="Stop streaming"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!value.trim()}
            className="shrink-0 rounded-full w-10 h-10 flex items-center justify-center bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 dark:disabled:text-gray-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
