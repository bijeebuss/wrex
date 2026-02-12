import { Link, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { SessionItem } from './SessionItem'
import type { SessionListItem } from '@/lib/api/sessions'

interface SidebarProps {
  sessions: SessionListItem[]
  isOpen: boolean
  onToggle: () => void
  onDelete: (id: string) => void
}

export function Sidebar({ sessions, isOpen, onToggle, onDelete }: SidebarProps) {
  const navigate = useNavigate()

  const handleNewChat = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const newId = crypto.randomUUID()
      navigate({ to: '/$sessionId', params: { sessionId: newId } })
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        onToggle()
      }
    },
    [navigate, onToggle],
  )

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar drawer */}
      <aside
        className={`
          fixed top-0 left-0 bottom-0 z-40 flex flex-col w-72 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
          transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header with New Chat button */}
        <div className="shrink-0 p-3 border-b border-gray-200 dark:border-gray-800">
          <a
            href="/"
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors cursor-pointer"
            onClick={handleNewChat}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New chat
          </a>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessions.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-gray-400 dark:text-gray-600">
              No conversations yet
            </div>
          ) : (
            sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </aside>
    </>
  )
}
