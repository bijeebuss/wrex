import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db, sqlite } from '@/lib/db/index'
import { eq } from 'drizzle-orm'
import { sessions } from '@/lib/db/schema'

export interface SessionListItem {
  id: string
  title: string | null
  status: string
  updatedAt: number
  lastMessageSnippet: string | null
}

export interface SessionWithMessages {
  id: string
  title: string | null
  claudeSessionId: string | null
  messages: Array<{
    id: string
    role: string
    content: string
    toolUse: string | null
    createdAt: number
  }>
}

/**
 * List all sessions ordered by most recent, with the last message snippet.
 * Uses raw SQL with a window function to efficiently get the latest message per session.
 */
export const listSessions = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionListItem[]> => {
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

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      updatedAt: row.updatedAt,
      lastMessageSnippet: row.lastMessageContent
        ? row.lastMessageContent.slice(0, 100)
        : null,
    }))
  },
)

/**
 * Load all messages for a session, plus session metadata.
 */
export const loadSessionMessages = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }): Promise<SessionWithMessages> => {
    const session = db.query.sessions
      .findFirst({
        where: eq(sessions.id, data.sessionId),
      })
      .sync()

    if (!session) {
      throw new Error(`Session not found: ${data.sessionId}`)
    }

    const msgs = sqlite
      .prepare(
        `SELECT id, role, content, tool_use as toolUse, created_at as createdAt
         FROM messages
         WHERE session_id = ?
         ORDER BY created_at ASC`,
      )
      .all(data.sessionId) as Array<{
      id: string
      role: string
      content: string
      toolUse: string | null
      createdAt: number
    }>

    return {
      id: session.id,
      title: session.title,
      claudeSessionId: session.claudeSessionId,
      messages: msgs,
    }
  })

/**
 * Delete a session (cascade deletes messages via foreign key).
 */
export const deleteSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }): Promise<{ success: true }> => {
    db.delete(sessions).where(eq(sessions.id, data.sessionId)).run()
    return { success: true }
  })
