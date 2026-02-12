import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>Wrex</h1>
      <p style={{ fontSize: '1.25rem', opacity: 0.7 }}>AI Assistant</p>
    </div>
  )
}
