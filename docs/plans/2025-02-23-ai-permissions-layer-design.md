# AI Permissions Layer — Design Document

**Date:** 2025-02-23  
**Status:** Approved

---

## 1. Problem & Goal

**Problem:** AI agent runtimes (e.g., OpenClaw) bypass written security rules, causing harmful actions like mass deleting emails, sending money unprovoked, etc.

**Goal:** Build an offline-first middleware that sits between any agent runtime and its tools. The middleware requires intent per action, applies user-defined rules, and returns a decision (ALLOW | BLOCK | REQUIRES_APPROVAL). The caller handles approval flows.

---

## 2. Architecture Overview

```
┌─────────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│  Agent Runtime  │────▶│  AI Permissions Layer    │────▶│  Tool Executor  │
│  (OpenClaw,     │     │  (middleware)            │     │  (gmail, etc.)  │
│   etc.)         │     │                          │     │                 │
└─────────────────┘     │  • Receives: toolCall,   │     └─────────────────┘
                         │    intent, compiledRules │
                         │  • Returns: ALLOW |     │
                         │    BLOCK | REQUIRES_    │
                         │    APPROVAL             │
                         │  • All logic in-process │
                         │  • Zero network default │
                         └──────────────────────────┘
```

**Principles:**
- **Offline-first:** All inference runs in-process. No network calls unless user configures remote LLM or opts into hosted service.
- **Return-only:** Middleware returns decision; caller handles prompting.
- **Agent-agnostic:** Works with any runtime that can wrap its tool executor.
- **Optional PaaS:** Hosted API is a thin wrapper over the same library.

---

## 3. Data Flow & Components

### Setup Phase (one-time / on config change)

```
Plain-text rules     ──▶  LLM compiler  ──▶  Structured rules  ──▶  Stored locally
```

### Runtime Phase (per tool call)

```
Tool call + intent  ──▶  Rule matcher (local)  ──▶  Match?  ──▶  ALLOW | BLOCK | REQUIRES_APPROVAL
                              │
                              └──▶  Ambiguous?  ──▶  Optional LLM fallback
```

### Decision Semantics

| Decision | Meaning |
|----------|---------|
| `ALLOW` | Execute immediately |
| `BLOCK` | Never execute. No approval path. |
| `REQUIRES_APPROVAL` | Do NOT execute until user explicitly approves. Caller must prompt and wait. Auto-approving without prompting is a caller bug. |

### Approval Options (when prompting user)

When the middleware returns `REQUIRES_APPROVAL`, the caller prompts the user. The user may choose:

| Option | Behavior |
|--------|----------|
| **Approve once** | Execute this tool call only. Do not persist. |
| **Approve forever** | Add an allow rule for this tool (and optionally intent), then execute. Future similar actions are allowed without prompting. |
| **Deny** | Do not execute. Treat as BLOCK. |

### Default When No Rules Match

When no rule matches the tool call + intent, the middleware uses a **configurable default**:

| Option | Behavior |
|--------|----------|
| `allow` | Execute immediately (opt-in permissive) |
| `require_approval` | Require user approval before executing (fail-safe) |

**System default:** `require_approval`. If the user does not configure a default, unmatched actions require approval.

**Configuration:** Passed at middleware creation, e.g. `createMiddleware(rules, executor, { defaultWhenNoMatch: 'allow' })`. Can be loaded from a config file during setup.

### Approve Forever Flow

When the user chooses "approve forever", the caller must:
1. Create an allow rule for the tool (and optionally intent pattern)
2. Merge it into the rules store and persist (e.g. append to `rules.compiled.json`)
3. Execute the tool call

The library provides a helper: `createAllowRule(toolCall, intent)` → `CompiledRule` for the caller to merge.

---

## 7. Rules Integrity: Agent-Proof Storage

**Problem:** The agent (e.g. OpenClaw) may have tools that can read/write files. If it can touch the rules file, it could add allow rules for itself and bypass the permissions layer.

**Principle:** Only the permissions layer (and the human user via trusted channels) may read or modify the rules. Agents can have broad file tools — users need them. Path protection intercepts and blocks any tool call that would write to the rules path.

### Required Integrator Responsibilities

| Responsibility | How |
|----------------|-----|
| **Enable path protection** | Path protection is the primary defense. Configure `dangerousTools` (file-writing tools for your agent) and `protectedPatterns` (rules paths). The middleware blocks any matching tool call before execution. |
| **Store rules outside agent workspace** | Default: `~/.config/ai-permissions-layer/` (or `$XDG_CONFIG_HOME`). Reduces chance the agent targets the path; path protection blocks it if it tries. |
| **Load rules in the integration layer** | The code that wraps the agent loads rules at startup. The agent never receives the rules path. |
| **Approve-forever writes go through trusted path** | When user chooses "approve forever", the integration layer (not the agent) calls `createAllowRule`, merges, and persists to the rules path. |

### Path Protection (Primary Defense)

Agents can have broad file tools (`filesystem.write`, `filesystem.edit`, etc.) — users need them for workflows. Path protection intercepts tool calls and **blocks** any that would write to the rules path.

**Config:** `pathProtection: { dangerousTools: ['filesystem.write', 'filesystem.edit', ...], protectedPatterns: ['**/rules*.json', '**/.config/ai-permissions-layer/**'] }`

**Defaults:** The library provides sensible defaults for common tool names and patterns. Integrators add agent-specific tool names if needed.

### Summary

Rules integrity is enforced by **path protection**: the middleware blocks any tool call that would write to the rules path. Agents can keep broad file tools; the middleware intercepts and blocks writes to protected paths before execution.

### Rule Extraction Mapping

| User phrase | Extracted action |
|-------------|------------------|
| "Don't allow X" / "Never X" | `block` |
| "Ask me before X" / "Prompt me for X" | `require_approval` |
| "Allow X" | `allow` |

**Critical:** "Ask me" / "Prompt me" must never map to `allow`.

---

## 4. Rules Schema & Compilation

### Input Format (user-facing)

```yaml
rules:
  - "I don't want it to auto delete emails"
  - "Ask me before deleting emails"
  - "Never send money without my approval"
  - "Block any gmail.batchDelete calls"
```

### Compiled Schema (internal)

```json
{
  "defaultWhenNoMatch": "require_approval",
  "rules": [
    {
      "action": "block",
      "tool": "gmail.delete",
      "toolPattern": "gmail\\.(delete|batchDelete)",
      "intentPattern": "delete.*email",
      "reason": "User: don't auto delete emails"
    },
    {
      "action": "require_approval",
      "tool": "gmail.delete",
      "intentPattern": "delete",
      "reason": "User: ask me before deleting emails"
    }
  ]
}
```

### Manual Overrides

Users can add structured rules directly:

```yaml
rules:
  - text: "Ask me before deleting"
  - structured:
      action: require_approval
      tool: "gmail.batchDelete"
```

---

## 5. Licensing & Distribution

**Chosen:** Dual licensing (GPL v3 + commercial)

- **GPL v3:** Free for personal/non-commercial use. Commercial use requires open-sourcing derivative work or obtaining commercial license.
- **Commercial license:** Separate terms for closed-source commercial use.
- **Attribution:** LICENSE file, package.json, optional "Powered by AI Permissions Layer" in PaaS.

**Distribution:**
- GitHub: Public repo
- NPM: `ai-permissions-layer` (or similar)
- PaaS: Optional hosted API, free tier non-commercial

---

## 6. Components Summary

| Component | Responsibility |
|-----------|----------------|
| Rule compiler | Plain text → structured rules (LLM) |
| Rule store | Load/save compiled rules |
| Rule matcher | Match tool call + intent against rules |
| Default config | `allow` or `require_approval` when no rule matches (default: `require_approval`) |
| LLM fallback | Classify ambiguous cases (optional) |
| Middleware API | `check(toolCall, intent, rules, options?) → decision` |
| `createAllowRule` | Helper to create allow rule when user chooses "approve forever" |
| PaaS wrapper | HTTP API (optional) |
