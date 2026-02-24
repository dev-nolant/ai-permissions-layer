import { describe, it, expect } from 'vitest';
import { createAllowRule } from '../src/rules';
import type { ToolCall, Intent } from '../src/types';

describe('createAllowRule', () => {
  it('creates allow rule for tool', () => {
    const toolCall: ToolCall = {
      toolName: 'gmail.delete',
      args: { ids: ['1'] },
    };
    const intent: Intent = { text: 'delete old emails' };
    const rule = createAllowRule(toolCall, intent);
    expect(rule.action).toBe('allow');
    expect(rule.tool).toBe('gmail.delete');
    expect(rule.reason).toContain('User approved forever');
  });
});
