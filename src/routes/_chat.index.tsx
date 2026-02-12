import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_chat/')({
  beforeLoad: () => {
    // Redirect bare "/" to a new session with a pre-generated ID
    throw redirect({ to: '/$sessionId', params: { sessionId: crypto.randomUUID() } })
  },
  component: () => null,
})
