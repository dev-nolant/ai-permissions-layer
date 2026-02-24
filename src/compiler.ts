import type { CompiledRule } from './types.js';
import type { LLMAdapter } from './llm-adapter.js';

const COMPILER_PROMPT = `You are a rule extractor. Convert user rules into structured JSON.

Rules:
- "don't allow" / "never" / "block" → action: "block"
- "ask me" / "prompt me" / "before X" → action: "require_approval" (NEVER "allow")
- "allow" → action: "allow"

Output ONLY valid JSON: { "rules": [ { "action": "...", "tool": "...", "reason": "..." } ] }
Include tool names when inferable (e.g. gmail.delete, gmail.batchDelete for email delete).
`;

export async function compile(
  plainTextRules: string[],
  llm: LLMAdapter
): Promise<{ rules: CompiledRule[] }> {
  const prompt = `${COMPILER_PROMPT}\n\nUser rules:\n${plainTextRules.map((r) => `- ${r}`).join('\n')}`;
  const raw = await llm.complete(prompt);
  const parsed = JSON.parse(raw) as { rules: CompiledRule[] };
  return { rules: parsed.rules };
}
