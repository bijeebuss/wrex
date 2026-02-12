export function ErrorBubble({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500/30">
        <p className="text-red-700 dark:text-red-300 text-sm">{message}</p>
        <button
          onClick={onRetry}
          className="mt-2 text-sm text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    </div>
  )
}
