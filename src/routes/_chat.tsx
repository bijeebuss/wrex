import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { listSessions, deleteSession } from '@/lib/api/sessions'

export const Route = createFileRoute('/_chat')({
  loader: async () => {
    const sessions = await listSessions()
    return { sessions }
  },
  component: ChatLayout,
})

function ChatLayout() {
  const { sessions } = Route.useLoaderData()
  const router = useRouter()

  // Default: open on md+ screens, closed on mobile (SSR-safe default: true)
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.innerWidth >= 768
  })

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteSession({ data: { sessionId: id } })
      router.invalidate()
    },
    [router],
  )

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        sessions={sessions}
        isOpen={isOpen}
        onToggle={handleToggle}
        onDelete={handleDelete}
      />

      <div
        className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-200 ease-in-out ${isOpen ? 'md:ml-72' : ''}`}
      >
        {/* Header bar */}
        <header className="shrink-0 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            {/* Hamburger toggle */}
            <button
              type="button"
              onClick={handleToggle}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer"
              aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {isOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                  />
                ) : (
                  <>
                    <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
                  </>
                )}
              </svg>
            </button>

            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Wrex
            </h1>
          </div>
        </header>

        {/* Content area */}
        <Outlet />
      </div>
    </div>
  )
}
