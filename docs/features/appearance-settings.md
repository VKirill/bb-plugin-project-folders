---
title: Appearance and preferences
type: component
created: 2026-09-27
updated: 2026-10-09
status: active
confidence: high
tags: [appearance, preferences, settings]
sources:
  - preferences.ts
  - appearance.tsx
  - chat-list.ts
  - server.ts
  - app.tsx
  - i18n.tsx
  - backup.ts
---
# Appearance and preferences

TL;DR: Shared preferences control chat lists, tree density and level styling; optional per-project and per-section styles can override or cascade to nested sections (`preferences.ts:66-90`, `preferences.ts:59-64`).

## Purpose

The plugin stores common preferences on the BB server so the sidebar, management page and settings page read the same values (`preferences.ts:3-7`, `server.ts:3460-3505`).

## How it works

1. `prefs_get` returns parsed shared preferences, per-item styles and whether UI preferences have been saved (`server.ts:581-589`, `server.ts:3460-3477`).
2. Parsing merges partial or old data with defaults, then validates each field and style (`preferences.ts:170-211`).
3. The appearance editor selects a preset or edits level styles, then `prefs_save` persists global preferences and can replace all item styles (`appearance.tsx:707-766`, `server.ts:3479-3495`).
4. A project/section style is saved or deleted using its `p:`/`f:` key; the UI resolves inherited styles and renders glyphs, colors and fills (`preferences.ts:216-225`, `appearance.tsx:391-447`, `server.ts:3496-3505`).
5. List settings determine sort order, list limits, idle hiding and automatic collapse (`preferences.ts:66-115`, `chat-list.ts:14-32`).

## Modes

| Area | Choices |
|---|---|
| Preset | `standard`, `mono`, `levels`, `projects` |
| Icon | Registered `icon:<name>` or `emoji:<text>` |
| Color | One of 12 named tokens or `#RRGGBB` |
| Fill | `none`, `badge`, `stripe`, `row` |
| Color source | `level` or `project` |
| Per-item options | Cascade, hidden from tree, sort mode and chat limit 1–100 |
| Density | `comfortable` or `compact`; indent 0–32 |

Exact allowed values and defaults: `preferences.ts:8-90`, `preferences.ts:94-153`.

### Settings transfer

The settings page has two JSON transfer scopes. Appearance export/import carries chat-list settings, level styling and optional per-project/section looks; it does not carry AGENTS.md rules. Full export carries the plugin’s durable database tables, while full import either replaces those rows or merges them (`appearance.tsx:935-945`, `appearance.tsx:966-1024`, `appearance.tsx:1032-1098`, `backup.ts:7-19`).

| Transfer | Contents and behavior | Evidence |
|---|---|---|
| Appearance export/import | Global list and appearance settings, plus optional replacement of per-item styles | `appearance.tsx:935-945`, `appearance.tsx:993-1024`, `preferences.ts:66-90` |
| Full export | Durable plugin tables, downloaded as `project-folders-backup.json`; transient export queues and unfinished move journals are excluded | `appearance.tsx:947-962`, `appearance.tsx:1032-1045`, `backup.ts:7-28` |
| Full import, replace | Clears the durable tables and inserts backup rows in one transaction | `appearance.tsx:1075-1097`, `backup.ts:179-190` |
| Full import, merge | Inserts backup rows without replacing local rows; key conflicts reject the transaction | `appearance.tsx:1059-1093`, `backup.ts:142-156`, `backup.ts:179-190` |

## Failures

| Failure | Result |
|---|---|
| Preference data is partial or stale | Valid values are retained; invalid fields/styles use defaults (`preferences.ts:170-211`). |
| Item style key or value is invalid | The parser drops that entry (`preferences.ts:199-211`). |
| Preference save fails | The settings UI reports the error instead of clearing it (`appearance.tsx:707-715`). |

## Business rules

- Per-item keys use `p:<projectId>` or `f:<folderId>` (`preferences.ts:216-225`, `server.ts:598-604`).
- A nested section inherits an ancestor’s appearance only when that style has `cascade` enabled (`preferences.ts:59-64`, `appearance.tsx:439-447`).
- Item styles can store a `hidden` flag for a project or section; tree filtering and the show-hidden switch are described in [Project and section tree](project-tree.md#modes) (`preferences.ts:59-64`, `app.tsx:2155-2167`).
- Invalid persisted preferences are repaired field-by-field; unsupported item keys/styles are dropped (`preferences.ts:170-211`).
- Import can replace global settings and optionally replace all per-item looks (`server.ts:590-597`, `server.ts:3479-3495`).
- Full backup import is separate from appearance import; replacement affects all durable plugin tables, and both import modes reject while moves or archives are unfinished (`backup.ts:7-28`, `backup.ts:105-139`, `backup.ts:179-190`).

## Public API

| RPC | Purpose | Evidence |
|---|---|---|
| `prefs_get`, `prefs_save` | Read and save shared settings; optional bulk item-style replacement | `server.ts:581-597` |
| `item_style_save` | Upsert or delete one project/section style | `server.ts:598-604`, `server.ts:3496-3505` |
| `backup_export`, `backup_import` | Export/import durable plugin tables, with replacement or merge mode | `server.ts:605-614`, `backup.ts:7-19`, `backup.ts:159-190` |

## Gotchas

- Language selection is browser-local; the rest of these preferences are stored in BB plugin storage (`i18n.tsx:39-48`, `server.ts:3460-3505`).
- Changing a preset replaces level appearance settings, while per-item appearance has its own storage (`preferences.ts:117-153`, `server.ts:3484-3490`).
- Full replacement import deletes existing durable plugin table rows before inserting the backup; the UI asks for confirmation (`backup.ts:179-190`, `appearance.tsx:1079-1094`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Data model](../data-model.md)
