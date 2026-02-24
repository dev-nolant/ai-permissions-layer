# AI Permissions Layer

Middleware that intercepts tool calls, applies your rules, and returns allow, block, or require approval.

## OpenClaw

```bash
openclaw plugins install ai-permissions-openclaw
```

Restart the gateway. Rules go in `~/.openclaw/ai-permissions-rules.json`. If the file is missing or empty, unmatched tools require approval by default.

**Config** (in `openclaw.json` under `plugins.entries.ai-permissions-openclaw.config`):

- `rulesPath` — path to rules file (default: `~/.openclaw/ai-permissions-rules.json`)
- `defaultWhenNoMatch` — `require_approval` | `allow` | `block` (default: `require_approval`)
- `pathProtection.enabled` — block writes to the rules file (default: true)

**Approval:** When a tool needs approval, reply `APPROVE <uuid>` or `DENY <uuid>` in chat.

## Rules file

JSON with a `rules` array. Each rule: `action` (`block` | `require_approval` | `allow`), `tool`, `reason`.

```json
{
  "rules": [
    { "action": "block", "tool": "gmail.delete", "reason": "no auto delete" },
    { "action": "require_approval", "tool": "write", "reason": "ask first" },
    { "action": "allow", "tool": "read", "reason": "read-only ok" }
  ]
}
```

See [examples/ai-permissions-rules.json](examples/ai-permissions-rules.json).

## Compile from plain text

If you prefer writing rules in plain English:

```bash
export OPENAI_API_KEY=your_key
npx ai-permissions-compile examples/rules.yaml ~/.openclaw/ai-permissions-rules.json
```

Format: one rule per line, each starting with `-`. See [examples/rules.yaml](examples/rules.yaml).

## Library usage

```bash
npm install ai-permissions-layer
```

```ts
import { createMiddleware, match } from 'ai-permissions-layer';

const rules = [
  { action: 'block', tool: 'gmail.delete', reason: 'no delete' },
  { action: 'require_approval', tool: 'gmail.send', reason: 'ask first' },
];

const middleware = createMiddleware(rules, executor, {
  defaultWhenNoMatch: 'require_approval',
  pathProtection: {},
});

const result = await middleware(
  { toolName: 'gmail.delete', args: {} },
  { text: 'delete emails' }
);
// result.decision === 'BLOCK', result.executed === false
```

## License

GPL v3.
