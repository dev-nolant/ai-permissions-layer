# AI Permissions Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an offline-first middleware library that intercepts AI agent tool calls, applies user-defined rules, and returns ALLOW | BLOCK | REQUIRES_APPROVAL.

**Architecture:** Library-first. Core: rule matcher (local) + rule compiler (LLM). Middleware wraps tool executor. Optional PaaS as HTTP wrapper.

**Tech Stack:** TypeScript, Node.js, Vitest (testing). LLM: configurable adapter (OpenAI-compatible API, local Ollama, etc.).

**Design Reference:** `docs/plans/2025-02-23-ai-permissions-layer-design.md`

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts` (empty export)
- Create: `LICENSE` (GPL v3)

**Step 1: Create package.json**

```json
{
  "name": "ai-permissions-layer",
  "version": "0.1.0",
  "description": "Offline-first middleware for AI agent tool call permissions",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "license": "GPL-3.0-or-later",
  "engines": { "node": ">=18" }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "strict": true
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

**Step 4: Create src/index.ts**

```ts
export {};
```

**Step 5: Install dependencies**

Run: `npm install && npm install -D typescript vitest @types/node`

**Step 6: Verify build**

Run: `npm run build`
Expected: `dist/index.js` created

**Step 7: Commit**

```bash
git add .
git commit -m "chore: project scaffolding"
```

---

## Task 2: Core types

**Files:**
- Create: `src/types.ts`
- Create: `tests/types.test.ts`

**Step 1: Write failing test**

```ts
// tests/types.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (types not defined)

**Step 3: Implement types**

```ts
// src/types.ts
export type Decision = 'ALLOW' | 'BLOCK' | 'REQUIRES_APPROVAL';

export interface ToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export interface Intent {
  text: string;
}

export type RuleAction = 'block' | 'require_approval' | 'allow';

export interface CompiledRule {
  action: RuleAction;
  tool?: string;
  toolPattern?: string;
  intentPattern?: string;
  reason: string;
}

export interface CheckResult {
  decision: Decision;
  reason?: string;
}

/** When no rule matches: 'allow' or 'require_approval'. Default: 'require_approval'. */
export type DefaultWhenNoMatch = 'allow' | 'require_approval';
```

**Step 4: Run test**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types.ts tests/types.test.ts
git commit -m "feat: add core types"
```

---

## Task 3: Rule matcher (local)

**Files:**
- Create: `src/matcher.ts`
- Create: `tests/matcher.test.ts`

**Step 1: Write failing tests**

```ts
// tests/matcher.test.ts
import { describe, it, expect } from 'vitest';
import { match } from '../src/matcher';
import type { ToolCall, Intent, CompiledRule } from '../src/types';

describe('match', () => {
  it('returns BLOCK when rule matches tool exactly', () => {
    const rules: CompiledRule[] = [
      { action: 'block', tool: 'gmail.delete', reason: 'no delete' },
    ];
    const result = match(
      { toolName: 'gmail.delete', args: {} },
      { text: 'delete emails' },
      rules
    );
    expect(result.decision).toBe('BLOCK');
    expect(result.reason).toContain('no delete');
  });

  it('returns REQUIRES_APPROVAL when rule matches', () => {
    const rules: CompiledRule[] = [
      { action: 'require_approval', tool: 'gmail.delete', reason: 'ask first' },
    ];
    const result = match(
      { toolName: 'gmail.delete', args: {} },
      { text: 'delete' },
      rules
    );
    expect(result.decision).toBe('REQUIRES_APPROVAL');
  });

  it('returns require_approval when no rules match (default)', () => {
    const rules: CompiledRule[] = [
      { action: 'block', tool: 'gmail.delete', reason: 'no delete' },
    ];
    const result = match(
      { toolName: 'gmail.send', args: {} },
      { text: 'send email' },
      rules
    );
    expect(result.decision).toBe('REQUIRES_APPROVAL');
  });

  it('returns ALLOW when no rules match and defaultWhenNoMatch is allow', () => {
    const rules: CompiledRule[] = [
      { action: 'block', tool: 'gmail.delete', reason: 'no delete' },
    ];
    const result = match(
      { toolName: 'gmail.send', args: {} },
      { text: 'send email' },
      rules,
      { defaultWhenNoMatch: 'allow' }
    );
    expect(result.decision).toBe('ALLOW');
  });

  it('matches toolPattern regex', () => {
    const rules: CompiledRule[] = [
      {
        action: 'block',
        toolPattern: 'gmail\\.(delete|batchDelete)',
        reason: 'no delete',
      },
    ];
    const result = match(
      { toolName: 'gmail.batchDelete', args: {} },
      { text: 'delete all' },
      rules
    );
    expect(result.decision).toBe('BLOCK');
  });

  it('BLOCK overrides REQUIRES_APPROVAL when both match', () => {
    const rules: CompiledRule[] = [
      { action: 'require_approval', tool: 'gmail.delete', reason: 'ask' },
      { action: 'block', tool: 'gmail.delete', reason: 'never' },
    ];
    const result = match(
      { toolName: 'gmail.delete', args: {} },
      { text: 'delete' },
      rules
    );
    expect(result.decision).toBe('BLOCK');
  });
});
```

**Step 2: Run test**

Run: `npm test tests/matcher.test.ts`
Expected: FAIL (match not implemented)

**Step 3: Implement matcher**

```ts
// src/matcher.ts
import type { ToolCall, Intent, CompiledRule, CheckResult, Decision, DefaultWhenNoMatch } from './types.js';

const ACTION_TO_DECISION: Record<CompiledRule['action'], Decision> = {
  block: 'BLOCK',
  require_approval: 'REQUIRES_APPROVAL',
  allow: 'ALLOW',
};

export interface MatchOptions {
  defaultWhenNoMatch?: DefaultWhenNoMatch;
}

export function match(
  toolCall: ToolCall,
  intent: Intent,
  rules: CompiledRule[],
  options: MatchOptions = {}
): CheckResult {
  const { defaultWhenNoMatch = 'require_approval' } = options;
  let matched: CompiledRule | null = null;
  let matchedAction: CompiledRule['action'] | null = null;

  for (const rule of rules) {
    const toolMatch =
      (rule.tool && rule.tool === toolCall.toolName) ||
      (rule.toolPattern && new RegExp(rule.toolPattern).test(toolCall.toolName));
    const intentMatch =
      !rule.intentPattern ||
      new RegExp(rule.intentPattern, 'i').test(intent.text);

    if (toolMatch && intentMatch) {
      if (!matched || rule.action === 'block') {
        matched = rule;
        matchedAction = rule.action;
        if (rule.action === 'block') break;
      }
    }
  }

  if (!matched) {
    return {
      decision: defaultWhenNoMatch === 'allow' ? 'ALLOW' : 'REQUIRES_APPROVAL',
      reason: 'No matching rule',
    };
  }

  return {
    decision: ACTION_TO_DECISION[matchedAction!],
    reason: matched.reason,
  };
}
```

**Step 4: Run test**

Run: `npm test tests/matcher.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/matcher.ts tests/matcher.test.ts
git commit -m "feat: add rule matcher"
```

---

## Task 4: Rule compiler (LLM)

**Files:**
- Create: `src/compiler.ts`
- Create: `src/llm-adapter.ts` (interface)
- Create: `tests/compiler.test.ts`

**Step 1: Define LLM adapter interface**

```ts
// src/llm-adapter.ts
export interface LLMAdapter {
  complete(prompt: string): Promise<string>;
}
```

**Step 2: Write compiler tests (mock LLM)**

```ts
// tests/compiler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { compile } from '../src/compiler';
import type { LLMAdapter } from '../src/llm-adapter';

describe('compile', () => {
  it('extracts block rule from "dont allow" phrase', async () => {
    const mockLLM: LLMAdapter = {
      complete: vi.fn().mockResolvedValue(JSON.stringify({
        rules: [
          { action: 'block', tool: 'gmail.delete', reason: 'User: dont auto delete' },
        ],
      })),
    };
    const result = await compile([
      "I don't want it to auto delete emails",
    ], mockLLM);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].action).toBe('block');
  });

  it('extracts require_approval from "ask me" phrase', async () => {
    const mockLLM: LLMAdapter = {
      complete: vi.fn().mockResolvedValue(JSON.stringify({
        rules: [
          { action: 'require_approval', tool: 'gmail.delete', reason: 'User: ask me before' },
        ],
      })),
    };
    const result = await compile(['Ask me before deleting emails'], mockLLM);
    expect(result.rules[0].action).toBe('require_approval');
  });
});
```

**Step 3: Run test**

Run: `npm test tests/compiler.test.ts`
Expected: FAIL (compile not implemented)

**Step 4: Implement compiler**

```ts
// src/compiler.ts
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
```

**Step 5: Run test**

Run: `npm test tests/compiler.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/compiler.ts src/llm-adapter.ts tests/compiler.test.ts
git commit -m "feat: add rule compiler with LLM adapter"
```

---

## Task 5: Middleware API

**Files:**
- Create: `src/middleware.ts`
- Create: `tests/middleware.test.ts`
- Modify: `src/index.ts`

**Step 1: Write failing test**

```ts
// tests/middleware.test.ts
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
    const middleware = createMiddleware(rules, executor, { defaultWhenNoMatch: 'allow' });
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
});
```

**Step 2: Run test**

Run: `npm test tests/middleware.test.ts`
Expected: FAIL

**Step 3: Implement middleware**

```ts
// src/middleware.ts
import { match } from './matcher.js';
import type { ToolCall, Intent, CompiledRule, CheckResult, DefaultWhenNoMatch } from './types.js';

export type ToolExecutor = (toolCall: ToolCall) => Promise<unknown>;

export interface MiddlewareResult extends CheckResult {
  executed: boolean;
  result?: unknown;
}

export interface MiddlewareOptions {
  defaultWhenNoMatch?: DefaultWhenNoMatch;
}

export function createMiddleware(
  rules: CompiledRule[],
  executor: ToolExecutor,
  options: MiddlewareOptions = {}
): (toolCall: ToolCall, intent: Intent) => Promise<MiddlewareResult> {
  const { defaultWhenNoMatch = 'require_approval' } = options;
  return async (toolCall, intent) => {
    const { decision, reason } = match(toolCall, intent, rules, { defaultWhenNoMatch });
    if (decision === 'BLOCK' || decision === 'REQUIRES_APPROVAL') {
      return { decision, reason, executed: false };
    }
    const result = await executor(toolCall);
    return { decision: 'ALLOW', executed: true, result };
  };
}
```

**Step 4: Run test**

Run: `npm test tests/middleware.test.ts`
Expected: PASS

**Step 5: Export from index**

```ts
// src/index.ts
export * from './types.js';
export * from './matcher.js';
export * from './compiler.js';
export * from './middleware.js';
export * from './llm-adapter.js';
```

**Step 6: Run all tests**

Run: `npm test`
Expected: All pass

**Step 7: Commit**

```bash
git add src/middleware.ts src/index.ts tests/middleware.test.ts
git commit -m "feat: add middleware API"
```

---

## Task 5b: createAllowRule helper (approve forever)

**Files:**
- Create: `src/rules.ts`
- Create: `tests/rules.test.ts`
- Modify: `src/index.ts`

**Step 1: Write failing test**

```ts
// tests/rules.test.ts
import { describe, it, expect } from 'vitest';
import { createAllowRule } from '../src/rules';
import type { ToolCall, Intent } from '../src/types';

describe('createAllowRule', () => {
  it('creates allow rule for tool', () => {
    const toolCall: ToolCall = { toolName: 'gmail.delete', args: { ids: ['1'] } };
    const intent: Intent = { text: 'delete old emails' };
    const rule = createAllowRule(toolCall, intent);
    expect(rule.action).toBe('allow');
    expect(rule.tool).toBe('gmail.delete');
    expect(rule.reason).toContain('User approved forever');
  });
});
```

**Step 2: Run test**

Run: `npm test tests/rules.test.ts`
Expected: FAIL

**Step 3: Implement createAllowRule**

```ts
// src/rules.ts
import type { ToolCall, Intent, CompiledRule } from './types.js';

export function createAllowRule(toolCall: ToolCall, _intent: Intent): CompiledRule {
  const date = new Date().toISOString().slice(0, 10);
  return {
    action: 'allow',
    tool: toolCall.toolName,
    reason: `User approved forever on ${date}`,
  };
}
```

**Step 4: Run test**

Run: `npm test tests/rules.test.ts`
Expected: PASS

**Step 5: Export from index**

Add to `src/index.ts`: `export * from './rules.js';`

**Step 6: Commit**

```bash
git add src/rules.ts tests/rules.test.ts src/index.ts
git commit -m "feat: add createAllowRule for approve forever flow"
```

---

## Task 5c: Path protection (required for rules integrity)

**Purpose:** Block tool calls that would write to the rules path. Agents can have broad file tools; path protection is the primary defense.

**Files:**
- Create: `src/path-protection.ts`
- Create: `tests/path-protection.test.ts`
- Modify: `src/middleware.ts` to run path check before rule match (when config provided)
- Modify: `src/types.ts` (add PathProtectionConfig)

**Step 1: Add config type**

Add to `src/types.ts`:
```ts
export interface PathProtectionConfig {
  /** Tool names that can write files (e.g. "filesystem.write", "edit_file") */
  dangerousTools: string[];
  /** Glob patterns for paths the agent must not write to */
  protectedPatterns: string[];
}
```

**Step 2: Write failing test**

```ts
// tests/path-protection.test.ts
import { describe, it, expect } from 'vitest';
import { isProtectedPathViolation } from '../src/path-protection';
import type { ToolCall } from '../src/types';

describe('isProtectedPathViolation', () => {
  const config = {
    dangerousTools: ['filesystem.write', 'filesystem.edit'],
    protectedPatterns: ['**/rules*.json', '**/.config/ai-permissions-layer/**'],
  };

  it('returns true when dangerous tool writes to protected path', () => {
    const call: ToolCall = {
      toolName: 'filesystem.write',
      args: { path: '/home/user/.config/ai-permissions-layer/rules.json', content: '{}' },
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
});
```

**Step 3: Implement path protection**

Use `minimatch` or simple regex for glob matching. Check `toolCall.toolName` against dangerousTools, and extract path from args (common keys: `path`, `file_path`, `filePath`, `filename`).

**Default dangerous tools:** `['filesystem.write', 'filesystem.edit', 'write_file', 'edit_file', 'writeFile', 'fs.writeFile']` — cover common agent tool names. Export `DEFAULT_DANGEROUS_TOOLS` and `DEFAULT_PROTECTED_PATTERNS` for integrators.

**Step 4: Integrate into middleware**

Before rule matching, if `pathProtection` config is provided and `isProtectedPathViolation` returns true, return `BLOCK` with reason `"Protected path: rules cannot be modified by agent"`.

**Middleware default:** When `pathProtection: {}` (empty object) is passed, use `DEFAULT_DANGEROUS_TOOLS` and `DEFAULT_PROTECTED_PATTERNS`. Integrators can override with custom lists.

**Step 5: Commit**

```bash
git add src/path-protection.ts src/types.ts src/middleware.ts tests/path-protection.test.ts
git commit -m "feat: add path protection for rules integrity"
```

---

## Task 6: CLI for rule compilation

**Files:**
- Create: `src/cli.ts`
- Create: `src/adapters/openai-adapter.ts` (example LLM impl)
- Modify: `package.json` (add bin, openai dep)

**Step 1: Add OpenAI adapter (optional dep)**

```ts
// src/adapters/openai-adapter.ts
import type { LLMAdapter } from '../llm-adapter.js';

export function createOpenAIAdapter(apiKey: string, model = 'gpt-4o-mini'): LLMAdapter {
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
      const data = await res.json();
      return data.choices[0].message.content;
    },
  };
}
```

**Step 2: Create CLI**

```ts
// src/cli.ts
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { compile } from './compiler.js';
import { createOpenAIAdapter } from './adapters/openai-adapter.js';

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args[0] || 'rules.yaml';
  const outputFile = args[1] || 'rules.compiled.json';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY required');
    process.exit(1);
  }
  const content = readFileSync(inputFile, 'utf-8');
  const rules = content.split('\n').filter((l) => l.trim().startsWith('-')).map((l) => l.replace(/^-\s*["']?|["']?$/g, '').trim());
  const llm = createOpenAIAdapter(apiKey);
  const { rules: compiled } = await compile(rules, llm);
  writeFileSync(outputFile, JSON.stringify({ rules: compiled }, null, 2));
  console.log(`Compiled ${compiled.length} rules to ${outputFile}`);
}
main().catch(console.error);
```

**Step 3: Add bin to package.json**

```json
"bin": { "ai-permissions-compile": "./dist/cli.js" },
"optionalDependencies": { "openai": "^4.0.0" }
```

**Step 4: Run build**

Run: `npm run build`
Expected: dist/cli.js exists

**Step 5: Commit**

```bash
git add src/cli.ts src/adapters/openai-adapter.ts package.json
git commit -m "feat: add CLI for rule compilation"
```

---

## Task 7: License and README

**Files:**
- Create: `LICENSE` (GPL v3 text)
- Create: `README.md`
- Create: `.gitignore` (node_modules, dist)

**Step 1: Add GPL v3 LICENSE**

Copy standard GPL v3 text. Add project name: "AI Permissions Layer"

**Step 2: Add README**

```markdown
# AI Permissions Layer

Offline-first middleware for AI agent tool call permissions. Intercepts tool calls, applies user-defined rules, returns ALLOW | BLOCK | REQUIRES_APPROVAL.

## License

Dual: GPL v3 (free for non-commercial) + commercial license available.
```

**Step 3: Add .gitignore**

```
node_modules
dist
*.compiled.json
.env
```

**Step 4: Commit**

```bash
git add LICENSE README.md .gitignore
git commit -m "docs: add license and README"
```

---

## Task 8: Optional PaaS HTTP wrapper (stretch)

**Files:**
- Create: `packages/paas/server.ts` (Express/Fastify)
- Create: `packages/paas/package.json`

Defer to post-MVP if time-constrained. Core library is shippable without PaaS.

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2025-02-23-ai-permissions-layer-implementation.md`.**

**Prerequisites:** Create a dedicated worktree before starting (use superpowers:using-git-worktrees).

**Two execution options:**

1. **Subagent-Driven (this session)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Parallel Session (separate)** — Open a new session with executing-plans in the worktree, batch execution with checkpoints.

Which approach do you prefer?
