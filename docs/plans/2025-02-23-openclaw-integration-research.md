# OpenClaw Integration Research

**Date:** 2025-02-23  
**Goal:** Integrate AI Permissions Layer as a zero-setup middleware plugin for OpenClaw.

---

## 1. OpenClaw Architecture Summary

### Tool Execution Flow

1. Agent receives message → model inference → tool calls
2. **`before_tool_call`** hook runs before each tool executes (intercept point)
3. Tool executes (or is blocked)
4. **`after_tool_call`** hook runs with result

### OpenClaw Tool Names (relevant for path protection)

| Group | Tools | Our mapping |
|-------|-------|-------------|
| `group:fs` | `read`, `write`, `edit`, `apply_patch` | Path protection: `write`, `edit`, `apply_patch` |
| `group:runtime` | `exec`, `bash`, `process` | N/A for rules file (exec has separate approvals) |
| `message` | Send to channels | N/A |
| `browser`, `web_*` | etc. | N/A |

**Path protection defaults for OpenClaw:** `['write', 'edit', 'apply_patch']` — these can modify files.

### LLM Providers (OpenClaw supports all of these)

- **Cloud:** OpenAI, Anthropic, Google Gemini, OpenRouter, Mistral, xAI, etc.
- **Local:** Ollama (`http://127.0.0.1:11434/v1`), vLLM (`http://127.0.0.1:8000/v1`), LM Studio (`http://localhost:1234/v1`), llama.cpp
- **Config:** `agents.defaults.model.primary` = `"provider/model"` (e.g. `ollama/llama3.3`, `openai/gpt-5.1-codex`)

All local providers expose **OpenAI-compatible** API. Our compiler can use the same base URL + model pattern.

---

## 2. Integration Strategy: OpenClaw Plugin

### Approach: Plugin with `before_tool_call` Hook

```
User message → Agent → Tool call → [before_tool_call] → Our middleware checks
                                    ↓
                              BLOCK? → Return synthetic error result (tool "failed")
                              REQUIRES_APPROVAL? → Emit approval request, wait or return blocked
                              ALLOW? → Continue (tool executes normally)
```

### Hook API (current)

- `api.registerHook("before_tool_call", handler, opts)`
- Handler receives tool call context; can **block** (throw or return special value) or **rewrite** params
- PR #12082 adds `api.lifecycle.on("tool.pre", ...)` — same underlying hook

### Blocking Behavior

When we want to BLOCK: return or throw a result that causes the tool to "fail" with our reason. The agent sees the tool result as an error. OpenClaw's hook contract: returning a value may substitute the tool result; throwing may abort. Need to verify exact semantics in OpenClaw source.

---

## 3. Zero-Setup Design

### What "zero setup" means

- User runs `openclaw plugins install ai-permissions-layer` (or `@scope/ai-permissions-layer`)
- Plugin enables by default
- **No extra API keys** — uses OpenClaw's configured model for rule compilation
- **No extra config** — sensible defaults
- Rules file optional — if missing, `defaultWhenNoMatch: require_approval` only

### Configuration (all optional)

```json5
{
  plugins: {
    entries: {
      "ai-permissions-layer": {
        enabled: true,
        config: {
          rulesPath: "~/.openclaw/ai-permissions-rules.json",
          defaultWhenNoMatch: "require_approval",
          useAgentModelForCompile: true,
          compilerModelOverride: null
        }
      }
    }
  }
}
```

| Option | Default | Purpose |
|--------|---------|---------|
| `rulesPath` | `~/.openclaw/ai-permissions-rules.json` | Where compiled rules live |
| `defaultWhenNoMatch` | `require_approval` | ALLOW or REQUIRES_APPROVAL when no rule matches |
| `useAgentModelForCompile` | `true` | Use agent's model for plain-text → rules compilation |
| `compilerModelOverride` | `null` | Override with specific model (e.g. `ollama/llama3.3`) for compile-only |

### Using OpenClaw's Model for Compilation

1. Read `api.config.agents.defaults.model.primary` (e.g. `ollama/llama3.3`)
2. Parse `provider/model`
3. Resolve provider config from `api.config.models.providers[provider]` or built-in catalog
4. Get `baseUrl`, `apiKey` from provider
5. Call OpenAI-compatible `POST /v1/chat/completions` (or Anthropic endpoint if provider uses it)
6. Local providers (Ollama, vLLM, LM Studio) use `baseUrl` + no/minimal auth

**Fallback:** If model resolution fails, log warning and skip compilation — users can add structured rules manually.

---

## 4. Intent Handling

OpenClaw does not expose "intent per message" as a first-class field. Options:

**A) Use last assistant text block** — Before the tool call, the model often outputs reasoning or intent. We can pass the most recent assistant message as `intent.text` for matching.

**B) Tool-only matching (simpler)** — Many rules are tool-scoped: "block gmail.delete", "ask before exec". Work without intent initially; add intent when we have conversation context in the hook.

**C) Extract from tool args** — For `message` tool, args may include `text`; for `write`, args include `path`. Use these as intent signals.

**Recommendation:** Start with (B). Add (A) when hook context provides `messages` or similar.

---

## 5. Approval Flow (REQUIRES_APPROVAL)

OpenClaw has `approvals.exec` for forwarding exec approvals to chat channels:

```json5
{
  approvals: {
    exec: {
      enabled: true,
      mode: "session",
      targets: [{ channel: "telegram", to: "123456789" }]
    }
  }
}
```

**Our approach:** Add `approvals.aiPermissions` (or similar) to forward our REQUIRES_APPROVAL prompts to the same channels. User replies:
- `/approve <id> allow-once`
- `/approve <id> allow-forever`
- `/approve <id> deny`

Alternatively: use the **existing** `approvals.exec` pattern if we can emit a compatible approval request. Or implement a minimal approval forwarder in our plugin that uses `api.runtime` or channel send.

**Simplest MVP:** When REQUIRES_APPROVAL, we BLOCK and return a tool result that says "This action requires your approval. Reply with /approve <id> allow-once or /approve <id> deny." The agent surfaces this to the user. We'd need a separate mechanism to resume (approval endpoint + token). For v1, REQUIRES_APPROVAL could behave as BLOCK with a clear message until we implement the full flow.

---

## 6. Path Protection for OpenClaw

OpenClaw's file tools use different arg shapes:

- `write`: `{ path, content }` or similar
- `edit`: `{ path, ... }`
- `apply_patch`: `{ path, patch }` or file refs

Our `extractPath` already checks `path`, `file_path`, `filePath`, `filename`. Should work.

**Protected patterns:** `**/ai-permissions-rules*.json`, `**/.openclaw/ai-permissions*.json`, `**/.config/ai-permissions-layer/**`

**Dangerous tools for OpenClaw:** `write`, `edit`, `apply_patch` (not `filesystem.write`).

---

## 7. Implementation Plan

### Phase 1: OpenClaw Plugin Shell

1. Create `packages/openclaw-plugin/` (or `extensions/ai-permissions-openclaw/`)
2. `openclaw.plugin.json` manifest
3. `package.json` with `openclaw.extensions`, dependency on `ai-permissions-layer`
4. Register `before_tool_call` hook
5. In hook: load rules from `rulesPath`, call `match(toolCall, intent, rules, options)`
6. Map OpenClaw tool call shape to our `ToolCall` type: `{ toolName: name, args: arguments }`
7. If BLOCK: return/throw to prevent execution
8. If ALLOW: return undefined (continue)
9. If REQUIRES_APPROVAL: for MVP, treat as BLOCK with message

### Phase 2: Model Integration

1. Add helper to resolve OpenClaw model config → baseUrl + apiKey
2. Implement `OpenClawLLMAdapter` that uses `api.config` + provider resolution
3. Wire into rule compiler when user runs `openclaw ai-permissions compile` (new CLI command)
4. Support both OpenAI-compatible and Anthropic-compatible providers

### Phase 3: Approval Flow

1. Emit approval request to active channel (via `api.runtime` or channel adapter)
2. Register `/approve` command or use existing approval infra
3. On approval: re-run tool or inject allow rule + continue

### Phase 4: CLI Commands

1. `openclaw ai-permissions compile [rules.yaml] [output.json]` — compile plain-text rules using agent's model
2. `openclaw ai-permissions list` — show current rules
3. `openclaw ai-permissions add "rule text"` — add and compile a single rule

---

## 8. File Structure (Proposed)

```
ai-permissions-layer/
├── packages/
│   ├── core/                 # Current library (or root src/)
│   └── openclaw-plugin/     # OpenClaw plugin
│       ├── package.json
│       ├── openclaw.plugin.json
│       ├── src/
│       │   ├── index.ts     # register(api)
│       │   ├── hook.ts      # before_tool_call handler
│       │   ├── openclaw-llm.ts  # LLM adapter using api.config
│       │   └── tool-map.ts  # OpenClaw tool name/args → our types
│       └── tsconfig.json
```

Or ship as a single package with optional OpenClaw peer:

```
ai-permissions-layer/
├── src/
├── openclaw/
│   ├── index.ts   # Plugin entry
│   └── ...
├── package.json   # "peerDependencies": { "openclaw": "*" }
```

---

## 9. Summary

| Requirement | Solution |
|-------------|----------|
| Middle layer | OpenClaw plugin with `before_tool_call` hook |
| Zero setup | Use agent's model, default rules path, no extra keys |
| Local LLMs | All expose OpenAI-compatible API; use provider baseUrl |
| Other providers | Resolve from `api.config.models.providers` |
| Path protection | OpenClaw tool names: `write`, `edit`, `apply_patch` |
| Intent | Start without; add from messages when available |
| Approval | MVP: BLOCK with message; later: approval forwarder |
