import { describe, it, expect, vi } from 'vitest';
import { compile } from '../src/compiler';
import type { LLMAdapter } from '../src/llm-adapter';

describe('compile', () => {
  it('extracts block rule from "dont allow" phrase', async () => {
    const mockLLM: LLMAdapter = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          rules: [
            {
              action: 'block',
              tool: 'gmail.delete',
              reason: 'User: dont auto delete',
            },
          ],
        })
      ),
    };
    const result = await compile(
      ["I don't want it to auto delete emails"],
      mockLLM
    );
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].action).toBe('block');
  });

  it('extracts require_approval from "ask me" phrase', async () => {
    const mockLLM: LLMAdapter = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          rules: [
            {
              action: 'require_approval',
              tool: 'gmail.delete',
              reason: 'User: ask me before',
            },
          ],
        })
      ),
    };
    const result = await compile(
      ['Ask me before deleting emails'],
      mockLLM
    );
    expect(result.rules[0].action).toBe('require_approval');
  });
});
