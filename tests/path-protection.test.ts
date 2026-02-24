import { describe, it, expect } from 'vitest';
import {
  isProtectedPathViolation,
  DEFAULT_DANGEROUS_TOOLS,
  DEFAULT_PROTECTED_PATTERNS,
  OPENCLAW_DANGEROUS_TOOLS,
} from '../src/path-protection';
import type { ToolCall, PathProtectionConfig } from '../src/types';

describe('isProtectedPathViolation', () => {
  const config: PathProtectionConfig = {
    dangerousTools: ['filesystem.write', 'filesystem.edit'],
    protectedPatterns: ['**/rules*.json', '**/.config/ai-permissions-layer/**'],
  };

  it('returns true when dangerous tool writes to protected path', () => {
    const call: ToolCall = {
      toolName: 'filesystem.write',
      args: {
        path: '/home/user/.config/ai-permissions-layer/rules.json',
        content: '{}',
      },
    };
    expect(isProtectedPathViolation(call, config)).toBe(true);
  });

  it('returns false when tool is not dangerous', () => {
    const call: ToolCall = { toolName: 'gmail.send', args: {} };
    expect(isProtectedPathViolation(call, config)).toBe(false);
  });

  it('returns false when dangerous tool writes to non-protected path', () => {
    const call: ToolCall = {
      toolName: 'filesystem.write',
      args: { path: '/tmp/foo.txt', content: 'x' },
    };
    expect(isProtectedPathViolation(call, config)).toBe(false);
  });

  it('exports defaults', () => {
    expect(DEFAULT_DANGEROUS_TOOLS).toContain('filesystem.write');
    expect(DEFAULT_PROTECTED_PATTERNS).toContain('**/rules*.json');
  });

  it('exports OpenClaw-specific dangerous tools', () => {
    expect(OPENCLAW_DANGEROUS_TOOLS).toContain('write');
    expect(OPENCLAW_DANGEROUS_TOOLS).toContain('edit');
    expect(OPENCLAW_DANGEROUS_TOOLS).toContain('apply_patch');
  });
});
