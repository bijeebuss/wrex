export function LoadingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="rounded-2xl px-5 py-3 bg-(--color-claude-bubble-light) dark:bg-(--color-claude-bubble)">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}
