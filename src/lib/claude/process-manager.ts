import { spawn, type ChildProcess } from 'node:child_process'

/**
 * Process lifecycle manager for Claude Code CLI.
 *
 * Tracks active Claude Code child processes, handles spawning with correct
 * flags, and ensures cleanup on disconnect/shutdown (no zombie processes).
 */
export class ClaudeProcessManager {
  private processes = new Map<string, ChildProcess>()

  /**
   * Spawn a new Claude Code CLI process for a session.
   *
   * @param sessionId - The Wrex session ID (used as map key)
   * @param prompt - The user prompt to send to Claude
   * @param opts - Optional: resumeSessionId, appendSystemPrompt, mcpConfigPath
   * @returns The spawned ChildProcess
   */
  spawn(
    sessionId: string,
    prompt: string,
    opts?: {
      resumeSessionId?: string
      appendSystemPrompt?: string
      mcpConfigPath?: string
    },
  ): ChildProcess {
    const args = [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--dangerously-skip-permissions',
    ]

    if (opts?.resumeSessionId) {
      args.push('--resume', opts.resumeSessionId)
    }

    if (opts?.appendSystemPrompt) {
      args.push('--append-system-prompt', opts.appendSystemPrompt)
    }

    if (opts?.mcpConfigPath) {
      args.push('--mcp-config', opts.mcpConfigPath)
    }

    const child = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      // detached: false (the default) -- child is part of same process group
    })

    // Close stdin immediately -- Claude CLI with -p flag doesn't need stdin,
    // but will hang waiting for it to close if left open.
    child.stdin.end()

    this.processes.set(sessionId, child)

    child.once('exit', () => {
      this.processes.delete(sessionId)
    })

    return child
  }

  /**
   * Kill a Claude process by session ID.
   * Sends SIGTERM first, then SIGKILL after 5 seconds if still alive.
   */
  kill(sessionId: string): void {
    const child = this.processes.get(sessionId)
    if (child && !child.killed) {
      child.kill('SIGTERM')
      // Force kill after 5-second timeout
      const forceKillTimer = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
      }, 5000)
      // Don't let the timer keep the process alive
      forceKillTimer.unref()
    }
    // Remove from map immediately (don't wait for exit event)
    this.processes.delete(sessionId)
  }

  /**
   * Kill all active Claude processes.
   */
  killAll(): void {
    for (const [id] of this.processes) {
      this.kill(id)
    }
  }

  /**
   * Get all active session IDs.
   */
  getActive(): string[] {
    return Array.from(this.processes.keys())
  }

  /**
   * Check if a session has an active Claude process.
   */
  isActive(sessionId: string): boolean {
    return this.processes.has(sessionId)
  }
}

// Singleton instance
export const processManager = new ClaudeProcessManager()

// Register server shutdown cleanup
process.on('exit', () => {
  processManager.killAll()
})

process.on('SIGTERM', () => {
  processManager.killAll()
  process.exit(0)
})
