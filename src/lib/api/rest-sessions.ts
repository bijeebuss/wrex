/**
 * REST endpoints for session management.
 *
 * Used by the React Native mobile app (and any other REST client).
 * Reuses the same SQL queries as the TanStack server functions in sessions.ts.
 */
import { db, sqlite } from '@/lib/db/index'
import { eq } from 'drizzle-orm'
import { sessions } from '@/lib/db/schema'
import type { SessionListItem, SessionWithMessages } from '@/lib/api/sessions'

/**
 * GET /api/sessions — list all sessions ordered by most recent
 */
export async function handleListSessions(): Promise<Response> {
  const rows = sqlite
    .prepare(
      `SELECT s.id, s.title, s.status, s.updated_at as updatedAt,
              m.content as lastMessageContent
       FROM sessions s
       LEFT JOIN (
         SELECT session_id, content, role,
                ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC) as rn
         FROM messages
       ) m ON m.session_id = s.id AND m.rn = 1
       ORDER BY s.updated_at DESC`,
    )
    .all() as Array<{
    id: string
    title: string | null
    status: string
    updatedAt: number
    lastMessageContent: string | null
  }>

  const result: SessionListItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    updatedAt: row.updatedAt,
    lastMessageSnippet: row.lastMessageContent
      ? row.lastMessageContent.slice(0, 100)
      : null,
  }))

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * GET /api/sessions/:id — load session with all messages
 */
export async function handleGetSession(sessionId: string): Promise<Response> {
  const session = db.query.sessions
    .findFirst({
      where: eq(sessions.id, sessionId),
    })
    .sync()

  if (!session) {
    return new Response(
      JSON.stringify({ error: `Session not found: ${sessionId}` }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const msgs = sqlite
    .prepare(
      `SELECT id, role, content, tool_use as toolUse, created_at as createdAt
       FROM messages
       WHERE session_id = ?
       ORDER BY created_at ASC`,
    )
    .all(sessionId) as Array<{
    id: string
    role: string
    content: string
    toolUse: string | null
    createdAt: number
  }>

  const result: SessionWithMessages = {
    id: session.id,
    title: session.title,
    claudeSessionId: session.claudeSessionId,
    messages: msgs,
  }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * DELETE /api/sessions/:id — delete a session (cascades to messages)
 */
export async function handleDeleteSession(sessionId: string): Promise<Response> {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run()
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
