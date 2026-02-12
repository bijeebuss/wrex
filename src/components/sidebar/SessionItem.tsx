import { Link } from '@tanstack/react-router'
import type { SessionListItem } from '@/lib/api/sessions'

interface SessionItemProps {
  session: SessionListItem
  onDelete: (id: string) => void
}

export function SessionItem({ session, onDelete }: SessionItemProps) {
  return (
    <Link
      to="/$sessionId"
      params={{ sessionId: session.id }}
      className="group relative block px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      activeProps={{
        className:
          'group relative block px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800',
      }}
    >
      <div className="pr-6 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {session.title || 'Untitled'}
        </div>
        {session.lastMessageSnippet && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {session.lastMessageSnippet}
          </div>
        )}
      </div>

      {/* Delete button - visible on hover */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDelete(session.id)
        }}
        className="absolute top-2 right-2 w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all cursor-pointer"
        aria-label={`Delete session: ${session.title || 'Untitled'}`}
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </Link>
  )
}
