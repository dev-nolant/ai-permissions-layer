import { match } from './matcher.js';
import {
  isProtectedPathViolation,
  DEFAULT_DANGEROUS_TOOLS,
  DEFAULT_PROTECTED_PATTERNS,
} from './path-protection.js';
import type {
  ToolCall,
  Intent,
  CompiledRule,
  DefaultWhenNoMatch,
  PathProtectionConfig,
} from './types.js';

export type ToolExecutor = (toolCall: ToolCall) => Promise<unknown>;

export interface MiddlewareResult {
  decision: 'ALLOW' | 'BLOCK' | 'REQUIRES_APPROVAL';
  reason?: string;
  executed: boolean;
  result?: unknown;
}

export interface MiddlewareOptions {
  defaultWhenNoMatch?: DefaultWhenNoMatch;
  pathProtection?: PathProtectionConfig | Record<string, never>;
}

function resolvePathProtection(
  pathProtection?: PathProtectionConfig | Record<string, never>
): PathProtectionConfig | null {
  if (!pathProtection) return null;
  if (Object.keys(pathProtection).length === 0) {
    return {
      dangerousTools: DEFAULT_DANGEROUS_TOOLS,
      protectedPatterns: DEFAULT_PROTECTED_PATTERNS,
    };
  }
  return pathProtection as PathProtectionConfig;
}

export function createMiddleware(
  rules: CompiledRule[],
  executor: ToolExecutor,
  options: MiddlewareOptions = {}
): (toolCall: ToolCall, intent: Intent) => Promise<MiddlewareResult> {
  const {
    defaultWhenNoMatch = 'require_approval',
    pathProtection,
  } = options;
  const pathConfig = resolvePathProtection(pathProtection);

  return async (toolCall, intent) => {
    if (pathConfig && isProtectedPathViolation(toolCall, pathConfig)) {
      return {
        decision: 'BLOCK',
        reason: 'Protected path: rules cannot be modified by agent',
        executed: false,
      };
    }
    const { decision, reason } = match(toolCall, intent, rules, {
      defaultWhenNoMatch,
    });
    if (decision === 'BLOCK' || decision === 'REQUIRES_APPROVAL') {
      return { decision, reason, executed: false };
    }
    const result = await executor(toolCall);
    return { decision: 'ALLOW', executed: true, result };
  };
}
