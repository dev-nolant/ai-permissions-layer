import type { ToolCall, Intent, CompiledRule } from './types.js';

export function createAllowRule(
  toolCall: ToolCall,
  _intent: Intent
): CompiledRule {
  const date = new Date().toISOString().slice(0, 10);
  return {
    action: 'allow',
    tool: toolCall.toolName,
    reason: `User approved forever on ${date}`,
  };
}
