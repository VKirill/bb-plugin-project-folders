---
title: Session context
type: component
created: 2026-09-27
updated: 2026-09-30
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

1. The UI asks for capability, own settings, inherited settings and an inventory of names available in the selected scope (`server.ts:502-526`, `server.ts:2094-2103`).
2. `SessionPolicyEditor` loads the scope’s own policy and the selectable inventory separately; a failed policy read renders an alert, while an inventory failure leaves the inventory empty. Saving normalizes the draft, calls `session_policy_save`, reloads the saved state, and reports errors in the editor (`session-policy-ui.tsx:126-191`).
3. `GroupRow` lets a scope inherit, allow only named entries, deny selected entries, or select all; for `allow`/`deny` it filters the combined inventory by name/label and accepts a custom name. Required items are sorted first and cannot be toggled (`session-policy-ui.tsx:313-423`).
5. The server reads and normalizes the `session_policies` JSON row for the global/project/folder key (`session-policy-server.ts:70-95`).
6. For a thread, the server maps its host and environment path to the deepest real section folder, then gathers policy layers nearest first (`session-policy-server.ts:130-142`, `session-policy-server.ts:102-128`).
7. Each group resolves independently. An `all` setting can lift a parent restriction; `allow` and `deny` carry selected names (`session-policy.ts:118-170`).
8. The server converts the effective policy into the core format and sends `null` when there is no restriction (`session-policy.ts:172-202`).
9. Inventory combines BB plugin metadata, project skills and host-discovered MCP/CLI plugins; failures from optional inventory sources return empty lists (`session-policy-server.ts:178-241`).

### `SessionPolicyEditor` and `GroupRow`

1. `SessionPolicyEditor` derives a stable scope key (`g`, `p:<projectId>` or `f:<folderId>`), clears the previous view when scope changes, then reads the policy and inventory through separate RPC calls. Policy-read errors render an alert; inventory errors are ignored so the editor can still show saved and built-in names (`session-policy-ui.tsx:126-171`).
2. Each filter group receives its own draft setting, inherited value, inventory list and busy state. A changed value updates only that group in the draft and clears the saved marker; save normalizes the whole draft, calls `session_policy_save`, reloads persisted state and marks it saved (`session-policy-ui.tsx:173-205`).
3. `GroupRow` merges supplied inventory with built-in names and names already in the saved rule, filters by a case-insensitive query over name/label, then sorts required entries first, entries that add session content next, and the rest alphabetically (`session-policy-ui.tsx:313-352`).
4. Its selector has four states: inherit removes the local override; `all` stores an empty name list; `allow` and `deny` keep the current list. `all` hides the item picker; the other own modes show it (`session-policy-ui.tsx:375-405`).
5. Item toggles add/remove a name while retaining the selected mode. Required entries are locked; they appear checked in `allow` and unchecked in `deny`, matching the resolver’s required-item behavior (`session-policy-ui.tsx:353-357`, `session-policy-ui.tsx:407-423`). A custom name is trimmed, ignored if empty/duplicate or no own mode exists, then added and cleared from the input (`session-policy-ui.tsx:358-363`, `session-policy-ui.tsx:447-450`).

| Editor state | Inputs and limits | Display/result |
|---|---|---|
| Loading | Scope read is unresolved | Show loading text; policy read failure shows an alert (`session-policy-ui.tsx:146-171`). |
| Loaded, inherited | No own filter for this group | Show inherited mode and origin; choosing inherit clears an override (`session-policy-ui.tsx:369-390`). |
| Loaded, `all` | Own filter mode is `all` | Persist an empty names list and hide item search (`session-policy-ui.tsx:380-405`). |
| Loaded, `allow` or `deny` | Own mode with saved names | Show searchable inventory and custom-name input; required rows are disabled (`session-policy-ui.tsx:398-423`, `session-policy-ui.tsx:447-450`). |
| Saving | Save request in flight | Disable group controls; on success reload and show saved state, on failure retain draft and show the error (`session-policy-ui.tsx:177-205`). |

Inventory entries are presentation choices, not validation gates: selected names missing from current inventory are reinserted as name-only rows, and users can add custom names (`session-policy-ui.tsx:334-338`, `session-policy-ui.tsx:358-363`).

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
| `session_policy_capability` | Report enforcement availability | `server.ts:502-505`, `server.ts:2094-2096` |
| `session_policy_read`, `session_policy_save` | Read/save policy at a scope | `server.ts:506-521`, `server.ts:2097-2102` |
| `session_policy_inventory` | List selectable names and BB plugin contributions | `server.ts:522-526`, `server.ts:2103`, `session-policy-server.ts:178-241` |

## Gotchas

- Saving a policy on stock BB persists it, but the plugin does not register the core resolver without the experimental extension (`session-policy-server.ts:52-68`).
- CLI support is group-specific; the policy editor’s saved values do not mean every CLI honors every group (`session-policy.ts:204-210`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Data model](../data-model.md)
