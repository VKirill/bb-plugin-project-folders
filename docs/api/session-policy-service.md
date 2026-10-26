---
title: Session policy service
type: component
created: 2026-10-26
updated: 2026-10-26
status: active
confidence: medium
tags: [session-policy, inheritance, api]
sources:
  - session-policy-server.ts
  - session-policy.ts
  - move-contract.ts
  - server.ts
  - session-inventory.ts
---
# Session policy service

TL;DR: `makeSessionPolicies` stores per-scope session filters, resolves nearest-first inheritance, reports inventory suggestions, and registers core enforcement only when BB exposes its experimental hook (`session-policy-server.ts:57-243`).

## Purpose

The service backs session-policy read, save, capability and inventory RPCs. It accepts project/folder placement through an injected resolver so API actions can validate the selected scope before reading or writing (`session-policy-server.ts:57-65`, `server.ts:2197-2206`).

## How it works

1. The factory detects whether `bb.agents.experimental_vkSessionPolicy` exists and maps scopes to stable database keys: `g`, `p:<projectId>` or `f:<folderId>` (`session-policy-server.ts:66-75`).
2. `read` loads the scope's JSON row, schema-validates it and normalizes it; missing, malformed or invalid rows become an empty policy (`session-policy-server.ts:76-86`). `write` normalizes first, deletes an empty policy row, or upserts nonempty JSON (`session-policy-server.ts:88-96`).
3. `layers` walks a section and its parents with cycle detection, then adds project and global policies. `folderFor` maps a core thread to the deepest real section containing its canonical workspace path on the same project and host; no environment path or matching section yields no folder (`session-policy-server.ts:102-142`).
4. When the hook exists, the service registers a resolver that resolves those layers and converts them to the core policy shape. When absent, it skips registration but still returns read, save and inventory functions with `available:false` (`session-policy-server.ts:68`, `session-policy-server.ts:144-153`).
5. `read` validates placement, returns the scope's own normalized value, inherited policy and effective policy, and reports the BB-wide `AGENTS.md` path/existence (`session-policy-server.ts:154-172`). Own policy precedes inherited layers during resolution (`session-policy.ts:144-169`).
6. `save` validates placement then normalizes and persists the supplied policy; an empty normalized policy deletes the key (`session-policy-server.ts:174-177`, `session-policy-server.ts:88-96`).
7. `inventory` gathers plugin contributions and BB plugin names. For project/folder scopes it also lists project skills and asks the selected host to collect CLI MCP/plugin names; each optional source failure falls back to an empty result (`session-policy-server.ts:178-241`).

| Branch | Condition | Outcome or failure |
|---|---|---|
| Global scope | `scope.kind === "global"` | Key `g`; inventory omits project skills and host configuration (`session-policy-server.ts:70-75`, `session-policy-server.ts:209-225`). |
| Project scope | Project scope resolves through injected `place` | Key `p:<projectId>`; inherited layers begin at project and global (`session-policy-server.ts:70-75`, `session-policy-server.ts:121-127`). |
| Folder scope | Folder scope resolves through injected `place` | Key `f:<folderId>`; inheritance walks that section, its parents, project and global (`session-policy-server.ts:70-75`, `session-policy-server.ts:102-127`). |
| Core hook present | `experimental_vkSessionPolicy` is a function | Registers the resolver; `available` is true (`session-policy-server.ts:66-68`, `session-policy-server.ts:144-153`). |
| Core hook absent | Hook is missing | Does not register enforcement; storage and RPC methods remain available with `available:false` (`session-policy-server.ts:66-68`, `session-policy-server.ts:144-153`). |
| Empty save | Normalization removes every value | Deletes the row for the scope (`session-policy-server.ts:88-95`). |
| Invalid stored JSON | JSON parse or schema validation fails | Treat as empty policy without rejecting read (`session-policy-server.ts:76-86`). |
| Inventory source failure | Plugin, skill or host lookup rejects | That source contributes an empty list; other sources are returned (`session-policy-server.ts:194-224`). |
| Placement/database failure | Injected `place` or database operation rejects | Read/save/inventory rejects to the caller; the service does not catch those failures (`session-policy-server.ts:154-180`, `session-policy-server.ts:88-96`). |

Policy filters apply per group: `bbPlugins`, `skills`, `mcpServers` and `nativePlugins`; switches cover user instructions, project instructions and Claude AI sync (`session-policy.ts:16-30`, `session-policy.ts:71-79`). Each group resolves independently, nearest defined value wins, and an `all` value can lift an inherited restriction (`session-policy.ts:12-15`, `session-policy.ts:144-169`).

## Business rules

- Required session items are removed from saved filters and remain in core allow/deny output (`session-policy.ts:32-60`, `session-policy.ts:118-141`, `session-policy.ts:172-201`).
- Group nodes cannot own a workspace path and are skipped when mapping a thread to a section (`session-policy-server.ts:130-141`).
- Inventory returns names and source labels only (`session-policy-server.ts:230-240`, `session-inventory.ts:6-22`).

## Public API

`session_policy_capability` returns `available`; `session_policy_read`, `session_policy_save` and `session_policy_inventory` call the matching service methods (`server.ts:2197-2206`).

## Gotchas

- Without BB's experimental hook, saved policies can still be edited and queried but do not filter sessions (`session-policy-server.ts:52-55`, `session-policy-server.ts:144-153`).
- A project/folder inventory needs a resolved host to include machine-local config; global inventory is not host-scoped (`session-policy-server.ts:207-225`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
