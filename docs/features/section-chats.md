---
title: Starting chats in sections
type: component
created: 2026-09-27
updated: 2026-09-30
status: active
confidence: high
tags: [composer, chats, sections]
sources:
  - composer-chip.tsx
  - section-tree.ts
  - section-environment.tsx
  - server.ts
  - app.tsx
---
# Starting chats in sections

TL;DR: The plugin adds section selection to its own new-chat flow and BB’s composer, then registers a BB environment whose path points at the selected section directory (`composer-chip.tsx:138-150`, `server.ts:3511-3535`).

## Purpose

BB’s normal project picker selects projects; the plugin adds a project/section tree to the composer and a `Project section` environment for choosing the working directory (`composer-chip.tsx:138-150`, `section-tree.ts:3-5`, `server.ts:3511-3535`).

## How it works

1. The plugin composer UI loads project and section data through `list`, and refreshes on a `changed` realtime event (`composer-chip.tsx:173-180`).
2. A section pick is retained in tab storage because applying a project can remount plugin composer surfaces (`section-tree.ts:113-157`).
3. The plugin uses BB’s composer pickers to apply the selected project and `Project section` environment; a tree row for a group serves as a label, not an environment (`composer-chip.tsx:138-150`, `section-tree.ts:160-179`).
4. BB validates the environment with `sectionEnvironmentFolder`; the server returns the bound folder path and `ownsPath: false` (`server.ts:3485-3535`).
5. A submitted message clears the remembered selection for the next draft (`composer-chip.tsx:213-221`).

## Modes

| Selection | Result | Condition |
|---|---|---|
| Project | Starts in project root | No section environment is selected |
| Folder section | Starts in section path | Section belongs to selected project and host |
| Group | Label only | User must choose a real child section |
| Section action fallback | Opens section picker/banner | Used when native BB project chip takeover is unavailable |

Mode checks are implemented in composer rendering and environment validation (`composer-chip.tsx:46-55`, `server.ts:3485-3535`, `section-environment.tsx:139-246`).

## Failures

| Failure | Result |
|---|---|
| Section missing or belongs to another project | Validation refuses the environment with an explanation (`server.ts:3485-3488`). |
| Group selected | Validation requires a real child section (`server.ts:3489-3493`). |
| Host mismatch or active move/archive | Environment validation refuses creation (`server.ts:3494-3527`). |
| Native project chip unavailable | The BB control stays unchanged and plugin section action remains available (`composer-chip.tsx:138-150`). |

## Business rules

- The selected section must exist, belong to the active project and have a path on the composer’s host (`server.ts:3485-3499`).
- Groups cannot serve as working directories (`server.ts:3489-3493`).
- A section inside a pending project/section move or active archive cannot start a new environment (`server.ts:3500-3527`).
- If BB’s native chip cannot be replaced, the original chip remains and the plugin’s section action remains available (`composer-chip.tsx:138-150`, `composer-chip.tsx:181-211`).
- Project, model and composer plugin data are passed through the section-chat creation path (`server.ts:570-573`, `server.ts:154-166`).

## Public API

| RPC / hook | Purpose | Evidence |
|---|---|---|
| `list` | Populate the composer’s tree | `composer-chip.tsx:173-180` |
| `spawn` | Create a chat from the plugin’s composer flow | `server.ts:570-573` |
| `section_pick` | Remember a section chosen in BB’s environment picker | `server.ts:526-533` |
| Experimental environment `section` | Validate and create a chat environment at a section path | `server.ts:3511-3535` |

## Gotchas

- A section without a folder binding on the composer host cannot be selected for that chat (`server.ts:3485-3499`).
- A project selection can remount the chip; the tab-scoped pick store keeps the section selection across that remount (`section-tree.ts:113-157`).
