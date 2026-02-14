import type { ContextUsage } from '@/types/chat'

const MAX_CONTEXT_TOKENS = 200_000

interface ContextBarProps {
  contextUsage: ContextUsage | null
}

export function ContextBar({ contextUsage }: ContextBarProps) {
  if (!contextUsage) return null

  const percentage = Math.min(
    (contextUsage.inputTokens / MAX_CONTEXT_TOKENS) * 100,
    100,
  )

  const barColor =
    percentage >= 80
      ? 'bg-red-500'
      : percentage >= 60
        ? 'bg-yellow-500'
        : 'bg-green-500'

  return (
    <div className="group relative mx-auto w-full max-w-3xl px-4 py-1">
      <div className="h-1 w-full rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-zinc-800 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-zinc-200 dark:text-zinc-900">
        {percentage.toFixed(1)}% context used ({contextUsage.inputTokens.toLocaleString()} tokens)
      </div>
    </div>
  )
}
