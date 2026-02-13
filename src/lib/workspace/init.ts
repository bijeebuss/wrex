/**
 * Workspace initialization — ensures required directories and template files exist.
 *
 * Called once at server startup. All operations are synchronous and idempotent:
 * existing files are never overwritten, so user edits are preserved.
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, extname } from 'node:path'

const workspaceDir = resolve('data/workspace')

// ---------------------------------------------------------------------------
// CLAUDE.md template — versioned inline so it ships with the code
// ---------------------------------------------------------------------------

const CLAUDE_MD_TEMPLATE = `# Wrex Workspace

This is your personal workspace. You have full control over it.

## Directory Structure

\`\`\`
data/workspace/
├── .claude/
│   └── CLAUDE.md        ← this file (workspace conventions)
├── memory/              ← persistent memory files (managed via MCP tools)
│   ├── user-profile.md  ← who you're talking to
│   ├── projects.md      ← active projects & context
│   └── ...              ← any topic-based files you create
└── SOUL.md              ← (optional) personality override
\`\`\`

## Commands

- \`/init\` — Re-run the onboarding flow to update your profile and preferences.

## Memory Conventions

- One file per topic (e.g. \`preferences.md\`, \`work-context.md\`).
- Use descriptive H2 headings — they power semantic search.
- Consolidate and prune regularly; don't let files grow unbounded.
- After editing memory files directly (via Edit/Write/Bash), call \`memory_reindex\`.
`

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create workspace directories and seed template files (idempotent).
 * Safe to call on every startup — never overwrites existing files.
 */
export function ensureWorkspace(): void {
  // Ensure dirs
  mkdirSync(join(workspaceDir, '.claude'), { recursive: true })
  mkdirSync(join(workspaceDir, 'memory'), { recursive: true })

  // Seed CLAUDE.md only if it doesn't exist
  const claudeMdPath = join(workspaceDir, '.claude', 'CLAUDE.md')
  if (!existsSync(claudeMdPath)) {
    writeFileSync(claudeMdPath, CLAUDE_MD_TEMPLATE, 'utf-8')
    console.log('[workspace] Seeded .claude/CLAUDE.md')
  }
}

/**
 * Check whether the memory directory contains any .md files (recursively).
 * Returns true if at least one markdown file exists.
 */
export function hasMemories(): boolean {
  const memoryDir = join(workspaceDir, 'memory')
  if (!existsSync(memoryDir)) return false
  return scanForMarkdown(memoryDir)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scanForMarkdown(dir: string): boolean {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return false
  }

  for (const entry of entries) {
    const full = join(dir, entry)
    try {
      const stat = statSync(full)
      if (stat.isFile() && extname(entry) === '.md') return true
      if (stat.isDirectory()) {
        if (scanForMarkdown(full)) return true
      }
    } catch {
      // Skip entries we can't stat
    }
  }

  return false
}
