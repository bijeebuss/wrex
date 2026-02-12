import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  claudeSessionId: text('claude_session_id'),
  title: text('title'),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  toolUse: text('tool_use'),
  claudeMessageId: text('claude_message_id'),
  costUsd: integer('cost_usd'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  durationMs: integer('duration_ms'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})
