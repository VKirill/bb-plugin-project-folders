---
title: Execution defaults
type: component
created: 2026-09-27
updated: 2026-10-09
status: active
confidence: medium
tags: [execution, provider, model, agent]
sources:
  - execution.ts
  - execution-ui.tsx
  - server.ts
  - composer-chip.tsx
  - README.md
---
# Execution defaults

TL;DR: The plugin lets users pin provider/model, reasoning, service tier, permission mode, folder/worktree environment, machine and optional CLI agent at global, project or section scope; each group inherits independently (`execution.ts:43-70`, `execution.ts:129-161`).

## Purpose

Execution defaults seed new chats with settings without replacing BB’s own defaults or the composer’s own pickers (`execution.ts:3-12`, `server.ts:462-480`).

## How it works

1. `ExecutionEditor` derives a stable key for global, project or section scope, clears the prior view, then calls `execution_read`; while pending it displays loading, and a failed read displays an alert (`execution-ui.tsx:61-112`).
2. `execution_read` returns the scope’s own values, effective and inherited resolutions, host, BB fallback values and agent catalog; the editor seeds its editable draft from `own` and enables the model group only when both provider and model are pinned (`server.ts:3098-3128`, `execution-ui.tsx:87-93`, `execution.ts:89-95`).
3. The model switch controls whether the provider/model picker displays the draft or the inherited/fallback value. While off, picker reconciliation changes are ignored; switching it off clears the model, reasoning and tier fields so they are inherited (`execution-ui.tsx:85-153`, `execution-ui.tsx:181-226`).
4. Permission mode, environment and machine each have their own switch and inherit independently. Environment choices are `folder` or `worktree`; machine choices are hosts where the project or section has a folder binding. The editor labels inherited values and uses the place’s host when no machine pin applies (`execution-ui.tsx:153-184`, `execution-ui.tsx:285-350`, `server.ts:1288-1320`).
5. Agent selection is disabled for global scope, while saving, or when CLI Agents is absent/unsupported. Save normalizes the draft, calls `execution_save`, reloads the saved state and shows success; RPC errors render as an alert and busy state is cleared (`execution-ui.tsx:186-205`, `execution-ui.tsx:405-415`).
6. For new chats, server-side resolution combines independently inherited field groups with BB fallback settings. Before `threads.spawn`, the server binds an applicable pinned agent; failures name the project or section that supplied it. A hand-picked composer agent or Lane Pilot profile takes precedence, and non-CLI-agent providers skip this binding (`server.ts:1398-1443`, `server.ts:3396-3414`).

### Execution editor states

| State/branch | Condition | Inputs and outcome |
|---|---|---|
| Loading/read failure | Before `execution_read` resolves, or its promise rejects | Shows loading; a rejected initial read shows an alert and prevents controls rendering (`execution-ui.tsx:92-112`). |
| Model inherited | Model group switch off | Picker displays inherited value, then fallback, then empty/default values; picker changes do not pin values (`execution-ui.tsx:116-153`). |
| Model pinned | Switch on | Picker displays draft values; changes update provider, model, reasoning and optional tier (`execution-ui.tsx:116-153`, `execution-ui.tsx:181-226`). |
| Permission inherited/pinned | `draft.permissionMode` absent/present | Picker shows inherited/fallback value when off; changing it only patches the draft when pinned (`execution-ui.tsx:154-179`, `execution-ui.tsx:228-259`). |
| Environment inherited/pinned | `draft.environmentMode` absent/present | Inherits when off; when on, chooses `folder` or `worktree` (`execution-ui.tsx:158-161`, `execution-ui.tsx:285-315`). |
| Machine inherited/pinned | `draft.hostId` absent/present | Inherits the nearest host pin or seeds from the offered hosts; picker is disabled when no host is offered (`execution-ui.tsx:162-184`, `execution-ui.tsx:316-350`). |
| Agent inherited/none/selected | Scope is project or section | Selects inheritance, explicit no-agent, or a catalog agent ID; if a pinned ID is absent from the current catalog, the UI keeps it as an option until changed (`execution-ui.tsx:353-391`). |
| Agent unavailable | CLI Agents is not installed or provider unsupported | The selector is disabled; the hint reports missing CLI Agents or the unsupported-provider error (`execution-ui.tsx:186-187`, `execution-ui.tsx:363-403`). |
| Saving/error | Save requested or RPC rejects | Controls show busy state; success reloads then marks saved; failure renders an alert and `finally` clears busy (`execution-ui.tsx:188-205`, `execution-ui.tsx:405-415`). |

## Modes

| Scope | Key | Inheritance |
|---|---|---|
| Plugin | `g` | Fallback for all projects |
| Project | `p:<projectId>` | Overrides global per field group |
| Section | `f:<folderId>` | Overrides nearest parent, project and global per field group |

| Setting group | Supported values |
|---|---|
| Reasoning | `none`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`, `ultracode` |
| Service tier | `default`, `fast` |
| Permission mode | `accept-edits`, `auto`, `full` |
| Environment | `folder`, `worktree` |
| Machine | Host ID; project/section choices are limited to hosts with a folder binding for that place |
| Agent | Explicit `none`, or native agent ID |

Schemas and hierarchy: `execution.ts:14-70`, `execution.ts:110-161`; offered hosts: `server.ts:1288-1320`; scope key construction and persistence: `server.ts:1127-1149`.

## Failures

| Failure | Result |
|---|---|
| Invalid scope or execution value | Zod validation rejects the RPC request (`server.ts:462-480`). |
| Provider does not support native agents or catalog read fails | Catalog reports support/error state and no usable agent list (`execution.ts:164-183`). |
| Pinned machine has no folder for the selected place | Project chats fall back to the project’s home host; section chats reject unless the selected host is the section’s pinned host (`server.ts:3321-3346`, `server.ts:3352-3360`). |
| Pinned agent cannot be applied | Chat creation fails during binding and the error names the project or section that supplied the pin (`server.ts:1412-1443`, `server.ts:3396-3402`). |

## Business rules

- Provider and model are a single pin group: both must be present for the place to own that group (`execution.ts:39-47`, `execution.ts:89-95`).
- An explicit `agentMode: "none"` overrides an inherited agent (`execution.ts:49-55`, `execution.ts:122-128`).
- If no place pins a group, the plugin leaves that field absent so BB’s remembered project defaults remain in effect (`execution.ts:3-12`, `execution.ts:150-162`).
- Environment and machine pins are independent. A section can pin `folder` to override an inherited worktree, and a pinned machine applies only when the place has a folder on that host (`execution.ts:53-63`, `execution.ts:110-121`, `server.ts:3321-3360`).
- A pinned agent that cannot be applied blocks chat creation and reports which project or section supplied it (`server.ts:1412-1443`, `server.ts:3396-3402`).
- CLI agent discovery supports Claude Code, Codex and OpenCode through the optional CLI Agents plugin (`execution.ts:25-34`).

## Public API

| RPC | Purpose | Evidence |
|---|---|---|
| `execution_read`, `execution_save` | Read/save pin values and resolved inheritance | `server.ts:462-480` |
| `execution_agents` | Query native agent catalog for a provider | `server.ts:534-540` |
| `spawn` | Start a chat with resolved composer fields | `server.ts:570-573` |

## Gotchas

- These values seed a new chat; the composer can still change them before sending (`execution.ts:3-12`).
- Agent pins require CLI Agents and a supported provider; the UI offers installation guidance when the plugin is missing (`execution.ts:164-183`, `execution-ui.tsx:337-366`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Data model](../data-model.md)
- [Starting chats in sections](section-chats.md)
