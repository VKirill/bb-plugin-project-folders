---
title: Session context
type: component
created: 2026-09-27
updated: 2026-09-28
status: active
confidence: medium
tags: [session-context, plugins, skills, mcp]
sources:
  - session-policy.ts
  - session-policy-server.ts
  - session-policy-ui.tsx
  - session-inventory.ts
  - server.ts
---
# Session context

TL;DR: On BB builds with the experimental session-policy extension, rules can filter BB plugins, skills, MCP servers and CLI plugins per global/project/section scope and control selected instruction switches (`session-policy-server.ts:52-68`, `session-policy.ts:16-30`).

## Purpose

The server stores rules and supplies a resolved per-thread policy to BB core; the UI hides the feature when the extension is unavailable (`session-policy-server.ts:52-68`, `session-policy-server.ts:144-150`).

## How it works

1. The UI asks for capability, own settings, inherited settings and an inventory of names available in the selected scope (`server.ts:482-524`).
2. `SessionPolicyEditor` loads the scope’s own policy and the selectable inventory separately; a failed policy read renders an alert, while an inventory failure leaves the inventory empty. Saving normalizes the draft, calls `session_policy_save`, reloads the saved state, and reports errors in the editor (`session-policy-ui.tsx:126-191`).
3. `GroupRow` lets a scope inherit, allow only named entries, deny selected entries, or select all; for `allow`/`deny` it filters the combined inventory by name/label and accepts a custom name. Required items are sorted first and cannot be toggled (`session-policy-ui.tsx:313-423`).
5. The server reads and normalizes the `session_policies` JSON row for the global/project/folder key (`session-policy-server.ts:70-95`).
6. For a thread, the server maps its host and environment path to the deepest real section folder, then gathers policy layers nearest first (`session-policy-server.ts:130-142`, `session-policy-server.ts:102-128`).
7. Each group resolves independently. An `all` setting can lift a parent restriction; `allow` and `deny` carry selected names (`session-policy.ts:118-170`).
8. The server converts the effective policy into the core format and sends `null` when there is no restriction (`session-policy.ts:172-202`).
9. Inventory combines BB plugin metadata, project skills and host-discovered MCP/CLI plugins; failures from optional inventory sources return empty lists (`session-policy-server.ts:178-241`).

## Modes

| Filter mode | Meaning |
|---|---|
| `all` | Explicitly inherit all entries and lift a parent restriction |
| `allow` | Load only listed names plus required infrastructure |
| `deny` | Load everything except listed names and required infrastructure |

| Switch | Effect |
|---|---|
| `userInstructions` | BB-wide `<dataDir>/AGENTS.md` inclusion |
| `projectInstructions` | Project instruction file inclusion |
| `claudeAiSync` | Claude account plugin/skill synchronization |

Schema limits names to 200 characters and 500 entries per group; the four filter groups and three switches are declared in `session-policy.ts:16-30`, `session-policy.ts:62-79`.

## Failures

| Failure | Result |
|---|---|
| BB core extension absent | Capability is false; policy resolver is not registered (`session-policy-server.ts:52-68`, `session-policy-server.ts:144-150`). |
| Stored policy is invalid JSON/schema | Reader returns an empty policy (`session-policy-server.ts:76-86`). |
| Inventory source is unavailable | That inventory source returns an empty list; other sources remain usable (`session-policy-server.ts:194-224`). |

## Business rules

- Inheritance order is section, ancestors, project, global (`session-policy-server.ts:102-128`).
- Required items cannot be removed: `environment-project-checkout`, `project-folders` and `bb-bridge` (`session-policy.ts:32-47`, `session-policy.ts:118-141`).
- The policy is enforced only when BB exposes `experimental_vkSessionPolicy` (`session-policy-server.ts:52-68`, `session-policy-server.ts:144-150`).
- CLI support varies: Claude Code and Codex support all four groups; OpenCode lacks native CLI plugins; Cursor supports BB plugins and MCP servers (`session-policy.ts:204-210`).
- Invalid stored JSON falls back to an empty policy (`session-policy-server.ts:76-86`).

## Public API

| RPC | Purpose | Evidence |
|---|---|---|
| `session_policy_capability` | Report enforcement availability | `server.ts:482-485` |
| `session_policy_read`, `session_policy_save` | Read/save policy at a scope | `server.ts:487-502` |
| `session_policy_inventory` | List selectable names and BB plugin contributions | `server.ts:503-524`, `session-policy-server.ts:178-241` |

## Gotchas

- Saving a policy on stock BB persists it, but the plugin does not register the core resolver without the experimental extension (`session-policy-server.ts:52-68`).
- CLI support is group-specific; the policy editor’s saved values do not mean every CLI honors every group (`session-policy.ts:204-210`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Data model](../data-model.md)
