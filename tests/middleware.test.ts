import { describe, it, expect } from 'vitest';
import { createMiddleware } from '../src/middleware';
import type { CompiledRule } from '../src/types';

describe('createMiddleware', () => {
  it('returns BLOCK and does not call executor when rule blocks', async () => {
    const rules: CompiledRule[] = [
      { action: 'block', tool: 'gmail.delete', reason: 'no delete' },
    ];
    const executor = async () => 'deleted';
    const middleware = createMiddleware(rules, executor);
    const result = await middleware(
      { toolName: 'gmail.delete', args: {} },
      { text: 'delete' }
    );
    expect(result.decision).toBe('BLOCK');
    expect(result.executed).toBe(false);
  });

  it('returns REQUIRES_APPROVAL when no rules match (default)', async () => {
    const rules: CompiledRule[] = [];
    const executor = async () => 'sent';
    const middleware = createMiddleware(rules, executor);
    const result = await middleware(
      { toolName: 'gmail.send', args: {} },
      { text: 'send' }
    );
    expect(result.decision).toBe('REQUIRES_APPROVAL');
    expect(result.executed).toBe(false);
  });

  it('returns ALLOW and executes when no rules match and defaultWhenNoMatch is allow', async () => {
    const rules: CompiledRule[] = [];
    const executor = async () => 'sent';
    const middleware = createMiddleware(rules, executor, {
      defaultWhenNoMatch: 'allow',
    });
    const result = await middleware(
      { toolName: 'gmail.send', args: {} },
      { text: 'send' }
    );
    expect(result.decision).toBe('ALLOW');
    expect(result.executed).toBe(true);
    expect(result.result).toBe('sent');
  });

  it('returns REQUIRES_APPROVAL and does not execute', async () => {
    const rules: CompiledRule[] = [
      { action: 'require_approval', tool: 'gmail.delete', reason: 'ask first' },
    ];
    const executor = async () => 'deleted';
    const middleware = createMiddleware(rules, executor);
    const result = await middleware(
      { toolName: 'gmail.delete', args: {} },
      { text: 'delete' }
    );
    expect(result.decision).toBe('REQUIRES_APPROVAL');
    expect(result.executed).toBe(false);
  });

  it('returns BLOCK when path protection detects rules file write', async () => {
    const rules: CompiledRule[] = [];
    const executor = async () => 'written';
    const middleware = createMiddleware(rules, executor, {
      defaultWhenNoMatch: 'allow',
      pathProtection: {},
    });
    const result = await middleware(
      {
        toolName: 'filesystem.write',
        args: {
          path: '/home/user/.config/ai-permissions-layer/rules.json',
          content: '{}',
        },
      },
      { text: 'save rules' }
    );
    expect(result.decision).toBe('BLOCK');
    expect(result.reason).toContain('Protected path');
    expect(result.executed).toBe(false);
  });
});
