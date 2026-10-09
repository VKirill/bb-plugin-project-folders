---
title: Chat list and activity
type: component
created: 2026-09-27
updated: 2026-10-09
status: active
confidence: high
tags: [chat-list, activity, sidebar]
sources:
  - chat-list.ts
  - preferences.ts
  - app.tsx
  - chat-settings.tsx
  - server.ts
---
# Chat list and activity

TL;DR: The plugin sidebar groups BB threads by their project and section, sorts each list, limits collapsed lists, preserves important chats, and derives unread and busy state from BB thread fields (`chat-list.ts:44-70`, `chat-list.ts:146-220`).

## Purpose

The plugin replaces a flat thread listing with project/section rows and per-place chat lists. The renderer uses helper functions for sorting, collapsed visibility, activity and busy state (`app.tsx:42-50`, `chat-list.ts:44-70`, `chat-list.ts:146-220`).

## How it works

1. The app reads BB sidebar threads and the plugin’s `list` RPC response, then associates each thread with its environment section or an explicit manual placement (`app.tsx:60-70`, `server.ts:280-292`, `chat-list.ts:251-263`).
2. Chats are ordered by pinned status first; then by title, creation time or activity time (`chat-list.ts:44-70`).
3. When a list is collapsed, the filter keeps pinned, unread, active, busy or recent chats and applies the configured per-list limit (`chat-list.ts:146-177`).
4. Activity sorting uses the latest of update, attention and creation timestamps, while treating an update within two seconds of `lastReadAt` as a read-only event (`chat-list.ts:180-199`).
5. Sections can auto-collapse based on activity age; manually stored collapse choices override automatic behavior (`chat-list.ts:95-131`, `chat-list.ts:202-220`).

## Modes

| Setting | Values | Effect |
|---|---|---|
| Chat sort | `activity`, `title`, `created` | Sort criterion after pinned chats |
| Collapsed list | limit 1–100 | Maximum visible chats after filtering |
| Idle hiding | 0–720 hours | Age cutoff; pinned, unread, active and busy chats remain visible |
| Section auto-collapse | on/off, threshold 0.25–720 hours | Collapse inactive sections; default is two hours |
| View | `comfortable` / `compact`; indent 0–32 | Tree density and nesting spacing |
| Show hidden | on/off | Include hidden projects and sections in the tree; hidden items appear dimmed (`preferences.ts:66-90`, `chat-settings.tsx:260-279`, `app.tsx:2155-2167`) |

Values and defaults come from `preferences.ts:66-115`; collapsed-list sorting and exclusions come from `chat-list.ts:14-29`, `chat-list.ts:146-177`.

## Failures

| Failure | Result |
|---|---|
| Malformed saved chat-list JSON | Defaults are returned (`chat-list.ts:14-32`). |
| Invalid setting fields | The affected fields fall back to defaults (`chat-list.ts:14-32`, `preferences.ts:170-197`). |
| Activity indicators absent | Busy state falls back to status, indicator and pending-interaction values (`chat-list.ts:202-220`). |

## Business rules

- Pinned chats sort before unpinned chats under all sort modes (`chat-list.ts:53-58`).
- Unread, pinned, active, busy and active-thread chats bypass idle hiding (`chat-list.ts:146-161`).
- `isThreadBusy` recognizes active status, non-none indicator, pending interaction and active workflow/background activity (`chat-list.ts:202-220`).
- A manual placement overrides the section inferred from the chat environment; clearing it restores environment-based placement (`chat-list.ts:251-263`).
- Chat-list settings are parsed field-by-field with defaults when stored data is invalid (`chat-list.ts:14-32`, `preferences.ts:170-197`).
- The “Show hidden” switch controls visibility of hidden project/section rows; the hide flag itself is stored on the project or section appearance record ([Project and section tree](project-tree.md#modes), `chat-settings.tsx:260-279`, `app.tsx:2155-2167`).

## Public API

| RPC | Purpose | Evidence |
|---|---|---|
| `list` | Threads’ associated sections, manual placements and tree state | `server.ts:280-292` |
| `thread_place`, `thread_place_clear` | File a chat in a list without changing its workspace | `server.ts:242-253` |
| `prefs_get`, `prefs_save` | Read/save shared list and view preferences | `server.ts:578-593` |
| `reorder` | Persist project and sibling section ordering | `server.ts:3089-3135` |

## Gotchas

- Opening a chat alone does not promote it by activity because matching `updatedAt` and `lastReadAt` values are treated as reads (`chat-list.ts:180-199`).
- A collapsed list filters by recency before applying the limit; expanded lists return the complete sorted list (`chat-list.ts:163-177`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Project and section tree](project-tree.md)
