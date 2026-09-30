---
title: Execution defaults
type: component
created: 2026-09-27
updated: 2026-09-30
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

TL;DR: The plugin lets users pin provider/model, reasoning level, service tier, permission mode and optional CLI agent at global, project or section scope, with each group inherited separately (`execution.ts:3-12`, `execution.ts:97-129`).

## Purpose

Execution defaults seed new chats with settings without replacing BB’s own defaults or the composer’s own pickers (`execution.ts:3-12`, `server.ts:462-480`).

## How it works

1. `ExecutionEditor` derives a stable key for global, project or section scope, clears the prior view, then calls `execution_read`; while pending it displays loading, and a failed read displays an alert (`execution-ui.tsx:61-112`).
2. `execution_read` returns the scope’s own values, effective and inherited resolutions, host, BB fallback values and agent catalog; the editor seeds its editable draft from `own` and enables the model group only when both provider and model are pinned (`server.ts:2977-3005`, `execution-ui.tsx:87-93`, `execution.ts:89-95`).
3. The model switch controls whether the provider/model picker displays the draft or the inherited/fallback value. While off, picker reconciliation changes are ignored; switching it off clears the model, reasoning and tier fields so they are inherited (`execution-ui.tsx:85-153`, `execution-ui.tsx:181-226`).
4. Permission mode has its own switch and picker; when not pinned it displays the inherited/fallback mode. Scope other than global exposes an agent selector with inherit, explicit no-agent, catalog agent IDs, and a retained option if the saved ID is no longer listed (`execution-ui.tsx:154-179`, `execution-ui.tsx:261-301`).
5. Agent selection is disabled for global scope, while saving, or when CLI Agents is absent/unsupported. Save normalizes the draft, calls `execution_save`, reloads the saved state and shows success; RPC errors are shown as an alert and busy state is cleared (`execution-ui.tsx:138-153`, `execution-ui.tsx:303-323`).
6. For new chats, server-side resolution combines independently inherited field groups with BB fallback settings. Before `threads.spawn`, the server binds an applicable pinned agent; failures name the project or section that supplied it. A hand-picked composer agent or Lane Pilot profile takes precedence, and non-CLI-agent providers skip this binding (`server.ts:1303-1367`, `server.ts:3254-3278`).

### Execution editor states

| State/branch | Condition | Inputs and outcome |
|---|---|---|
| Loading/read failure | Before `execution_read` resolves, or its promise rejects | Shows loading; a rejected initial read shows an alert and prevents controls rendering (`execution-ui.tsx:92-112`). |
| Model inherited | Model group switch off | Picker displays inherited value, then fallback, then empty/default values; picker changes do not pin values (`execution-ui.tsx:116-153`). |
| Model pinned | Switch on | Picker displays draft values; changes update provider, model, reasoning and optional tier (`execution-ui.tsx:116-153`, `execution-ui.tsx:181-226`). |
| Permission inherited/pinned | `draft.permissionMode` absent/present | Picker shows inherited/fallback value when off; changing it only patches the draft when pinned (`execution-ui.tsx:154-179`, `execution-ui.tsx:228-259`). |
| Agent inherited/none/selected | Scope is project or section | Selects inheritance, explicit no-agent, or an agent ID; global scope has no agent selector. A stale pinned ID remains an option until changed (`execution-ui.tsx:261-301`). |
| Agent unavailable | CLI Agents is not installed or provider unsupported | Selector is disabled and an install/support hint is rendered (`execution-ui.tsx:133-136`, `execution-ui.tsx:303-311`). |
| Saving/error | Save requested or RPC rejects | Controls show busy state; success reloads then marks saved; failure renders an alert and clears busy (`execution-ui.tsx:138-153`, `execution-ui.tsx:313-323`). |
3. Resolution walks nearest section to parents, project, then global; provider/model, permission mode and agent resolve independently (`execution.ts:97-129`).
4. When a plugin composer starts a chat, the server merges the resolved values with BB’s fallback and applies them to the composer request (`server.ts:1000-1045`, `server.ts:1500-1668`).
5. When CLI Agents is installed, the plugin loads the provider’s agent catalog and binds the chosen native agent; unsupported providers expose no native agent list (`execution.ts:25-34`, `execution.ts:164-183`, `execution-ui.tsx:337-366`).

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
| Agent | Explicit `none`, or native agent ID |

Schemas and hierarchy: `execution.ts:13-55`, `execution.ts:97-129`; scope key construction and persistence: `server.ts:1000-1025`.

## Failures

| Failure | Result |
|---|---|
| Invalid scope or execution value | Zod validation rejects the RPC request (`server.ts:462-480`). |
| Provider does not support native agents or catalog read fails | Catalog reports support/error state and no usable agent list (`execution.ts:164-183`). |
| Pinned agent cannot be applied | Chat creation fails during binding and the error names the project or section that supplied the pin (`server.ts:1303-1367`, `server.ts:3257-3262`). |

## Business rules

- Provider and model are a single pin group: both must be present for the place to own that group (`execution.ts:39-47`, `execution.ts:89-95`).
- An explicit `agentMode: "none"` overrides an inherited agent (`execution.ts:49-55`, `execution.ts:122-128`).
- If no place pins a group, the plugin leaves that field absent so BB’s remembered project defaults remain in effect (`execution.ts:3-12`, `execution.ts:150-162`).
- A pinned agent that cannot be applied blocks chat creation and reports which project or section supplied it (`server.ts:1303-1367`, `server.ts:3257-3262`).
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
