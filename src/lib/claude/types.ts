// Claude Code CLI NDJSON event types
// Source: Verified against Claude Code v2.1.39 with --output-format stream-json --verbose --include-partial-messages

// --- System Event ---

export interface SystemEvent {
  type: 'system'
  subtype: 'init' | 'hook_started' | 'hook_response'
  session_id: string
  uuid: string
  // init subtype fields
  cwd?: string
  tools?: Record<string, unknown>[]
  model?: string
  mcp_servers?: Record<string, unknown>[]
  // hook subtype fields
  hook_id?: string
  hook_name?: string
  hook_event?: string
  [key: string]: unknown
}

// --- Stream Event ---

export interface StreamEventDelta {
  type: 'text_delta' | 'input_json_delta'
  text?: string
  partial_json?: string
}

export interface StreamEventContentBlock {
  type: 'text' | 'tool_use'
  name?: string
  id?: string
  text?: string
}

export interface StreamEventPayload {
  type:
    | 'message_start'
    | 'content_block_start'
    | 'content_block_delta'
    | 'content_block_stop'
    | 'message_delta'
    | 'message_stop'
  index?: number
  delta?: StreamEventDelta
  content_block?: StreamEventContentBlock
  message?: Record<string, unknown>
}

export interface StreamEvent {
  type: 'stream_event'
  event: StreamEventPayload
  session_id: string
  parent_tool_use_id: string | null
  uuid: string
}

// --- Assistant Event ---

export interface AssistantTextBlock {
  type: 'text'
  text: string
}

export interface AssistantToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export type AssistantContentBlock = AssistantTextBlock | AssistantToolUseBlock

export interface AssistantMessage {
  model: string
  id: string
  role: 'assistant'
  content: AssistantContentBlock[]
  stop_reason: string | null
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

export interface AssistantEvent {
  type: 'assistant'
  message: AssistantMessage
  session_id: string
  parent_tool_use_id: string | null
  uuid: string
}

// --- Result Event ---

export interface ResultUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

export interface ResultEvent {
  type: 'result'
  subtype: 'success' | 'error'
  is_error: boolean
  duration_ms: number
  num_turns: number
  result: string
  session_id: string
  total_cost_usd: number
  usage: ResultUsage
  uuid: string
}

// --- Discriminated Union ---

export type ClaudeEvent = SystemEvent | StreamEvent | AssistantEvent | ResultEvent
