import { memo } from 'react'
import type { ToolCallState } from '../../types/chat'

const TOOL_LABELS: Record<string, string> = {
  memory_search: 'Searched memory',
  memory_get: 'Read memory',
  memory_write: 'Wrote to memory',
}

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name
}

function ToolBlockInner({ tool }: { tool: ToolCallState }) {
  return (
    <details className="my-2 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/50 text-sm">
        {tool.status === 'running' ? (
          <svg
            className="w-4 h-4 animate-spin text-blue-500 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <svg
            className="w-4 h-4 text-green-500 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
        <span className="text-gray-700 dark:text-gray-300 font-medium">
          {getToolLabel(tool.name)}
        </span>
        {tool.status === 'running' && (
          <span className="text-xs text-gray-400 ml-auto">running...</span>
        )}
      </summary>
      {tool.input && (
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
          <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap break-all">
            {formatToolInput(tool.input)}
          </pre>
        </div>
      )}
    </details>
  )
}

function formatToolInput(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2)
  } catch {
    return input
  }
}

export const ToolBlock = memo(ToolBlockInner)
