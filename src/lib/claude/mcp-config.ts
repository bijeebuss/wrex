/**
 * Built-in MCP server definitions.
 *
 * These are infrastructure servers that ship with Wrex and are always available.
 * User-configured servers (e.g. todoist) live in data/workspace/.mcp.json
 * and are auto-discovered by Claude CLI via its cwd.
 */

const BUILTIN_SERVERS = {
  'wrex-memory': {
    type: 'http',
    url: 'http://localhost:55520/api/mcp',
  },
  playwright: {
    command: 'bash',
    args: ['-c', 'npx @playwright/mcp@latest --user-data-dir "$HOME/.browser-profile"'],
  },
}

/**
 * Returns the built-in MCP config as a JSON string,
 * suitable for passing directly to `--mcp-config`.
 */
export function getBuiltinMcpConfig(): string {
  return JSON.stringify({ mcpServers: BUILTIN_SERVERS })
}
