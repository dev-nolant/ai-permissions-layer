import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { LLMAdapter } from '../llm-adapter.js';

function resolvePath(p: string): string {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return path.resolve(p);
}

function loadOpenClawEnv(): void {
  const envPath = resolvePath('~/.openclaw/.env');
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && !(m[1] in process.env)) {
        const val = m[2].replace(/^["']|["']$/g, '').trim();
        process.env[m[1]] = val;
      }
    }
  } catch {
    /* ignore */
  }
}

function loadOpenClawConfig(): Record<string, unknown> | null {
  const paths = [
    resolvePath('~/.openclaw/openclaw.json'),
    resolvePath('~/.config/openclaw/openclaw.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function resolveEnvValue(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  const m = val.match(/^\$\{?([A-Z_][A-Z0-9_]*)\}?$/);
  if (m) return process.env[m[1]];
  return val;
}

const BUILTIN_PROVIDERS: Record<
  string,
  { baseUrl: string; getApiKey: () => string | undefined }
> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    getApiKey: () => process.env.OPENAI_API_KEY,
  },
  ollama: {
    baseUrl: 'http://127.0.0.1:11434/v1',
    getApiKey: () => 'ollama',
  },
  'lm-studio': {
    baseUrl: 'http://localhost:1234/v1',
    getApiKey: () => 'lm-studio',
  },
  lmstudio: {
    baseUrl: 'http://localhost:1234/v1',
    getApiKey: () => 'lm-studio',
  },
  vllm: {
    baseUrl: 'http://127.0.0.1:8000/v1',
    getApiKey: () => '',
  },
};

/**
 * Create an LLM adapter that uses OpenClaw's primary model from ~/.openclaw/openclaw.json.
 * Falls back to OpenAI if config is missing or model resolution fails.
 */
export function createOpenClawAdapter(fallbackApiKey?: string): LLMAdapter | null {
  loadOpenClawEnv();
  const config = loadOpenClawConfig();
  if (!config) return null;

  const agents = (config.agents ?? config.agent) as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const modelConfig = (defaults?.model ?? agents?.model) as Record<string, unknown> | undefined;
  const primary = modelConfig?.primary as string | undefined;
  if (!primary || typeof primary !== 'string') return null;

  const slash = primary.indexOf('/');
  const provider = slash >= 0 ? primary.slice(0, slash) : 'openai';
  const modelId = slash >= 0 ? primary.slice(slash + 1) : primary;

  const models = config.models as Record<string, unknown> | undefined;
  const providers = models?.providers as Record<string, Record<string, unknown>> | undefined;
  const providerConfig = providers?.[provider];

  let baseUrl: string;
  let apiKey: string | undefined;

  if (providerConfig?.baseUrl) {
    baseUrl = (providerConfig.baseUrl as string).replace(/\/$/, '');
    if (!baseUrl.endsWith('/v1')) baseUrl += '/v1';
    apiKey = resolveEnvValue(providerConfig.apiKey) ?? (providerConfig.apiKey as string);
  } else {
    const builtin = BUILTIN_PROVIDERS[provider] ?? BUILTIN_PROVIDERS.openai;
    baseUrl = builtin.baseUrl;
    apiKey = builtin.getApiKey();
  }

  if (!apiKey && provider === 'openai') {
    apiKey = fallbackApiKey ?? process.env.OPENAI_API_KEY;
  }
  if (!apiKey && provider !== 'ollama' && provider !== 'lmstudio' && provider !== 'lm-studio' && provider !== 'vllm') {
    return null;
  }

  const chatUrl = `${baseUrl}/chat/completions`;
  const completionsUrl = `${baseUrl}/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };

  async function tryChatWithModel(model: string, p: string): Promise<string> {
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: p }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenClaw model request failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (content == null) throw new Error('No response content from model');
    return content;
  }

  return {
    async complete(prompt: string) {
      const tryChat = async (): Promise<string> => {
        const res = await fetch(chatUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          if (res.status === 404 && /not a chat model|chat\/completions/i.test(err)) {
            throw new Error('USE_COMPLETIONS');
          }
          throw new Error(`OpenClaw model request failed: ${res.status} ${err}`);
        }
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (content == null) throw new Error('No response content from model');
        return content;
      };

      const tryCompletions = async (): Promise<string> => {
        const res = await fetch(completionsUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: modelId,
            prompt,
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`OpenClaw model request failed: ${res.status} ${err}`);
        }
        const data = (await res.json()) as {
          choices?: Array<{ text?: string }>;
        };
        const text = data.choices?.[0]?.text;
        if (text == null) throw new Error('No response content from model');
        return text.trim();
      };

      try {
        return await tryChat();
      } catch (e) {
        if (e instanceof Error && e.message === 'USE_COMPLETIONS') {
          try {
            return await tryCompletions();
          } catch {
            /* fall through to chat fallback */
          }
        }
        if (provider === 'openai' && apiKey) {
          console.error(`Primary model ${modelId} does not support chat; using gpt-4o-mini for compile`);
          return await tryChatWithModel('gpt-4o-mini', prompt);
        }
        throw e;
      }
    },
  };
}
