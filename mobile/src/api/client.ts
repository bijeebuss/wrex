/**
 * REST client for session management.
 */
import { getServerUrl } from '../config'
import type { SessionListItem, SessionWithMessages } from '../types'

export async function fetchSessions(): Promise<SessionListItem[]> {
  const base = await getServerUrl()
  const res = await fetch(`${base}/api/sessions`)
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`)
  return res.json()
}

export async function fetchSession(sessionId: string): Promise<SessionWithMessages> {
  const base = await getServerUrl()
  const res = await fetch(`${base}/api/sessions/${sessionId}`)
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`)
  return res.json()
}

export async function deleteSession(sessionId: string): Promise<void> {
  const base = await getServerUrl()
  const res = await fetch(`${base}/api/sessions/${sessionId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`)
}
