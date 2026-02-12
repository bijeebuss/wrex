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

export interface MemorySnippet {
  filePath: string
  heading: string
  content: string
  startLine: number
  endLine: number
}
