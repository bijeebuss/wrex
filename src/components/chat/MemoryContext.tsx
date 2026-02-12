import type { MemorySnippet } from '../../types/chat'

interface MemoryContextProps {
  snippets: MemorySnippet[]
}

export function MemoryContext({ snippets }: MemoryContextProps) {
  if (snippets.length === 0) return null

  return (
    <div className="mx-auto max-w-2xl mb-4">
      <details className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 overflow-hidden">
        <summary className="px-4 py-2.5 cursor-pointer flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 list-none [&::-webkit-details-marker]:hidden">
          <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
            />
          </svg>
          Memory context loaded
          <span className="ml-auto text-xs text-gray-400">
            {snippets.length} snippet{snippets.length !== 1 ? 's' : ''}
          </span>
        </summary>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
          {snippets.map((s, i) => (
            <div key={i} className="text-sm">
              <div className="text-xs text-gray-400 font-mono">
                {s.filePath}:{s.startLine}-{s.endLine}
              </div>
              {s.heading && (
                <div className="font-medium text-gray-600 dark:text-gray-300">
                  {s.heading}
                </div>
              )}
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                {s.content.length > 200
                  ? s.content.slice(0, 200) + '...'
                  : s.content}
              </p>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
