import { minimatch } from 'minimatch';
import type { ToolCall, PathProtectionConfig } from './types.js';

export const DEFAULT_DANGEROUS_TOOLS = [
  'filesystem.write',
  'filesystem.edit',
  'write_file',
  'edit_file',
  'writeFile',
  'fs.writeFile',
];

/** OpenClaw file tools (group:fs) that can write files */
export const OPENCLAW_DANGEROUS_TOOLS = ['write', 'edit', 'apply_patch'];

export const DEFAULT_PROTECTED_PATTERNS = [
  '**/rules*.json',
  '**/.config/ai-permissions-layer/**',
];

const PATH_KEYS = ['path', 'file_path', 'filePath', 'filename'];

function extractPath(args: Record<string, unknown>): string | null {
  for (const key of PATH_KEYS) {
    const val = args[key];
    if (typeof val === 'string') return val;
  }
  return null;
}

export function isProtectedPathViolation(
  toolCall: ToolCall,
  config: PathProtectionConfig
): boolean {
  if (!config.dangerousTools.includes(toolCall.toolName)) {
    return false;
  }
  const path = extractPath(toolCall.args);
  if (!path) return false;
  const normalizedPath = path.replace(/\\/g, '/');
  return config.protectedPatterns.some((pattern) =>
    minimatch(normalizedPath, pattern)
  );
}
