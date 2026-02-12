import { useRef, useState, useCallback, useEffect } from 'react'
import type { ChatMessage } from '../types/chat'

interface UseAutoScrollOptions {
  messages: ChatMessage[]
  isStreaming: boolean
}

interface UseAutoScrollReturn {
  containerRef: React.RefObject<HTMLDivElement | null>
  showScrollButton: boolean
  scrollToBottom: () => void
  latestMessageRef: React.RefObject<HTMLDivElement | null>
}

export function useAutoScroll({ messages, isStreaming }: UseAutoScrollOptions): UseAutoScrollReturn {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const latestMessageRef = useRef<HTMLDivElement | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const isAutoScrollEnabled = useRef(true)
  const lastScrollTop = useRef(0)
  const prevMessageCount = useRef(0)

  // When a new assistant message appears, scroll it into view and re-enable auto-scroll
  useEffect(() => {
    const currentCount = messages.length
    if (currentCount > prevMessageCount.current) {
      const lastMsg = messages[currentCount - 1]
      if (lastMsg?.role === 'assistant') {
        isAutoScrollEnabled.current = true
        // Scroll the new message into view
        if (latestMessageRef.current) {
          latestMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
    }
    prevMessageCount.current = currentCount
  }, [messages.length])

  // Set up IntersectionObserver on the latest assistant message sentinel
  useEffect(() => {
    if (!latestMessageRef.current || !containerRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // When the top of the latest message exits the viewport (scrolled past top), stop auto-scroll
          if (!entry.isIntersecting && isStreaming) {
            isAutoScrollEnabled.current = false
          }
        }
      },
      {
        root: containerRef.current,
        rootMargin: '0px 0px 0px 0px',
        threshold: 0,
      },
    )

    observer.observe(latestMessageRef.current)
    return () => observer.disconnect()
  }, [messages.length, isStreaming])

  // Detect manual scrolling (user scrolls up during streaming)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleScroll() {
      if (!container) return
      const currentScrollTop = container.scrollTop

      // If user scrolled up during streaming, disable auto-scroll
      if (isStreaming && currentScrollTop < lastScrollTop.current - 10) {
        isAutoScrollEnabled.current = false
      }

      lastScrollTop.current = currentScrollTop

      // Update scroll button visibility
      const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100
      setShowScrollButton(!isNearBottom)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [isStreaming])

  // Auto-scroll during streaming when enabled
  useEffect(() => {
    if (!isStreaming || !isAutoScrollEnabled.current) return

    const container = containerRef.current
    if (!container) return

    // Scroll to bottom when content changes during streaming
    container.scrollTop = container.scrollHeight
  })

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
    isAutoScrollEnabled.current = true
    setShowScrollButton(false)
  }, [])

  return { containerRef, showScrollButton, scrollToBottom, latestMessageRef }
}
