import { useState, useCallback, useEffect } from 'react'
import { fetchSessions, deleteSession as apiDeleteSession } from '../api/client'
import type { SessionListItem } from '../types'

interface UseSessionsReturn {
  sessions: SessionListItem[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  deleteSession: (id: string) => Promise<void>
}

export function useSessions(): UseSessionsReturn {
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchSessions()
      setSessions(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    await apiDeleteSession(id)
    setSessions(prev => prev.filter(s => s.id !== id))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { sessions, loading, error, refresh, deleteSession }
}
