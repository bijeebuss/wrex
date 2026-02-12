import type { ClaudeEvent } from './types'

/**
 * Buffer-based NDJSON line parser for Claude Code CLI stdout.
 *
 * Handles the buffer-splitting pitfall: Node.js stdout delivers arbitrary-sized
 * chunks -- a single JSON line may be split across chunks, or multiple lines may
 * arrive in one chunk. This implementation buffers incoming data and only parses
 * complete lines (delimited by '\n').
 */
export function parseNDJSON(
  stdout: NodeJS.ReadableStream,
  onEvent: (event: ClaudeEvent) => void,
  onError: (error: Error) => void,
): void {
  let buffer = ''

  stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf-8')
    const lines = buffer.split('\n')
    // Keep the last (possibly incomplete) element in the buffer
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const event: ClaudeEvent = JSON.parse(trimmed)
        onEvent(event)
      } catch {
        onError(new Error(`Failed to parse NDJSON line: ${trimmed}`))
      }
    }
  })

  stdout.on('end', () => {
    // Process any remaining data in buffer
    const trimmed = buffer.trim()
    if (trimmed) {
      try {
        const event: ClaudeEvent = JSON.parse(trimmed)
        onEvent(event)
      } catch {
        onError(new Error(`Failed to parse final NDJSON line: ${trimmed}`))
      }
    }
  })
}
