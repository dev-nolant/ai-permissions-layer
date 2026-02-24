import type { LLMAdapter } from '../llm-adapter.js';

export function createOpenAIAdapter(
  apiKey: string,
  model = 'gpt-4o-mini'
): LLMAdapter {
  return {
    async complete(prompt: string) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices[0].message.content;
    },
  };
}
