import { describe, it, expect } from 'vitest';
import type { Decision, ToolCall, Intent, CompiledRule, DefaultWhenNoMatch } from '../src/types';

describe('types', () => {
  it('Decision has expected values', () => {
    const decisions: Decision[] = ['ALLOW', 'BLOCK', 'REQUIRES_APPROVAL'];
    expect(decisions).toContain('ALLOW');
    expect(decisions).toContain('BLOCK');
    expect(decisions).toContain('REQUIRES_APPROVAL');
  });

  it('ToolCall has toolName and args', () => {
    const call: ToolCall = { toolName: 'gmail.delete', args: { ids: ['1'] } };
    expect(call.toolName).toBe('gmail.delete');
  });

  it('CompiledRule has action, tool, reason', () => {
    const rule: CompiledRule = {
      action: 'block',
      tool: 'gmail.delete',
      reason: 'User: no auto delete',
    };
    expect(rule.action).toBe('block');
  });

  it('DefaultWhenNoMatch has allow and require_approval', () => {
    const defaults: DefaultWhenNoMatch[] = ['allow', 'require_approval'];
    expect(defaults).toContain('allow');
    expect(defaults).toContain('require_approval');
  });
});
