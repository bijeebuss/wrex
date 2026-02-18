// Shared types — mirrors the web app types

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  toolCalls?: ToolCallState[]
  error?: string
}

export interface ToolCallState {
  id: string
  name: string
  input: string
  status: 'running' | 'complete'
}

export type ChatStatus = 'idle' | 'streaming' | 'done' | 'error'

export interface ContextUsage {
  inputTokens: number
  outputTokens: number
}

export interface MemorySnippet {
  filePath: string
  heading: string
  content: string
  startLine: number
  endLine: number
}

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
