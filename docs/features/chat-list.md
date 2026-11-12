---
title: Chat list and activity
type: component
created: 2026-09-27
updated: 2026-11-04
status: active
confidence: medium
tags: [chat-list, activity, sidebar]
sources:
  - chat-list.ts
  - chat-tree.ts
  - preferences.ts
  - app.tsx
  - chat-settings.tsx
  - server.ts
---
# Chat list and activity

TL;DR: The plugin sidebar groups BB threads by their project and section, hangs child chats under their parent inside each group, sorts each level, limits collapsed lists by top-level chats, preserves important chats, and derives unread and busy state from BB thread fields (`chat-list.ts:44-70`, `chat-list.ts:146-220`, `chat-tree.ts:22-92`, `chat-tree.ts:131-156`).

## Purpose

The plugin replaces a flat thread listing with project/section rows and per-place chat lists. The renderer uses helper functions for sorting, collapsed visibility, activity and busy state (`app.tsx:42-50`, `chat-list.ts:44-70`, `chat-list.ts:146-220`).

## How it works

1. The app reads BB sidebar threads and the plugin’s `list` RPC response, then associates each thread with its environment section or an explicit manual placement (`app.tsx:60-70`, `server.ts:2484-2544`, `chat-list.ts:257-266`).
2. Chats are ordered by pinned status first; then by title, creation time or activity time (`chat-list.ts:44-70`).
3. `buildChatTree` hangs each chat under its `parentThreadId` parent when that parent is in the same sorted group; otherwise the chat is a root. Siblings keep the group's sort order at every level (`chat-tree.ts:22-92`, `app.tsx:2720-2800`).
4. When a list is collapsed, the filter works on roots: a root stays while it or any chat below it is pinned, unread, active, busy or recent, and the configured per-list limit then applies to roots, with a pinned, unread, busy or open chat below a root keeping that root past the limit (`chat-list.ts:146-177`, `chat-tree.ts:131-156`).
5. An arrow before a chat with children folds or unfolds its branch. A folded branch shows the number of all chats below it and, when any of them is unread or busy, a «Has unread chats» or «Work in progress» sign (a marker with the same name when the row is narrow). Both forms are in the row and CSS picks one by the width of the chat's own link (`@container pf-branch-link`, wide from 320 px when nothing else sits beside the title, from 440 px with the row's own status pill or a «works in» badge, from 540 px with both: `data-extras` on the link), not by phone or window width, so a narrow sidebar on a desktop also shows markers (`app.tsx:1930-1946`, `app.tsx:2027-2072`, `chat-tree.ts:108-115`, `style.css`).
6. Activity sorting uses the latest of update, attention and creation timestamps, while treating an update within two seconds of `lastReadAt` as a read-only event (`chat-list.ts:180-199`).
7. Sections can auto-collapse based on activity age; manually stored collapse choices override automatic behavior (`chat-list.ts:335-413`).
8. When activity ordering is enabled, sibling sections rank by unread reply, then busy work, then latest conversation activity; manual order breaks ties. The setting off keeps saved order (`chat-list.ts:415-504`, `app.tsx:2411-2425`).

## Modes

| Setting | Values | Effect |
|---|---|---|
| Chat sort | `activity`, `title`, `created` | Sort criterion after pinned chats |
| Collapsed list | limit 1–100 | Maximum visible chats after filtering |
| Idle hiding | 0–720 hours | Age cutoff; pinned, unread, active and busy chats remain visible |
| Section auto-collapse | on/off, threshold 0.25–720 hours | Collapse inactive sections; default is two hours |
| Section ordering | activity / manual | Activity mode ranks unread, busy, then recent sections; manual mode uses saved order; projects always keep their manually configured order (`chat-settings.tsx:98-110`, `chat-list.ts:415-504`) |

Values and defaults come from `preferences.ts:68-119`; collapsed-list sorting and exclusions come from `chat-list.ts:14-29`, `chat-list.ts:146-177`. Density, indentation and hidden-item display are covered by [Appearance and preferences](appearance-settings.md).

## Failures

| Failure | Result |
|---|---|
| A parent cycle or a chat that is its own parent | Each chat is still listed once: the cycle member that sorts first becomes a root, the rest of the cycle hangs below it, and a chat that hangs from the cycle stays under its parent, wherever it sorts (`chat-tree.ts:71-90`). |
| Malformed or blocked saved fold state | Every branch starts unfolded; with blocked storage a fold lasts for the page only (`chat-tree.ts:184-195`, `app.tsx:2610-2625`). |
| Malformed saved chat-list JSON | Defaults are returned (`chat-list.ts:14-32`). |
| Invalid setting fields | The affected fields fall back to defaults (`chat-list.ts:14-32`, `preferences.ts:170-197`). |
| Activity indicators absent | Busy state falls back to status, indicator and pending-interaction values (`chat-list.ts:202-220`). |

## Business rules

- Pinned chats sort before unpinned chats under all sort modes, within every level of a branch (`chat-list.ts:59-75`).
- The tree is built inside one displayed group only. A child whose parent is in another section, archived or absent is a root of its own group, so every active chat stays reachable (`chat-tree.ts:22-45`, `app.tsx:2720-2800`).
- Moving a chat (menu or drag) acts on the chosen chat alone and never changes `parentThreadId`; a moved child leaves its branch because its group changes (`app.tsx:2530-2580`).
- Folded branches are kept in the browser under `localStorage` key `project-folders:collapsed-chats` as a list of chat ids; absent means unfolded. Opening a chat from outside unfolds only the parents that the tree draws above it in its own group, once per newly opened chat (opening another chat, or none, allows it again); folds of branches in other sections or behind an archived parent are left alone, and a later manual fold, a list update, or the same chat or one of its parents missing from the list for a moment does not bring the unfolding back (`chat-tree.ts:162-182`, `app.tsx:2632-2668`).
- Branch depth has no configured limit. Building the tree is iterative; drawing a branch is recursive, one call per level, so only a chain deeper than the JavaScript call stack would fail (`chat-tree.ts:22-92`, `app.tsx:2744-2790`).
- Unread, pinned, active, busy and active-thread chats bypass idle hiding (`chat-list.ts:146-161`).
- `isThreadBusy` recognizes active status, non-none indicator, pending interaction and active workflow/background activity (`chat-list.ts:202-220`).
- A manual placement overrides the section inferred from the chat environment; clearing the saved placement lets `placeOf` fall back to the environment binding (`chat-list.ts:257-269`, `server.ts:2322-2326`).
- Chat-list settings are parsed field-by-field with defaults when stored data is invalid (`chat-list.ts:14-32`, `preferences.ts:170-197`).
- Activity ordering ranks a folder with unread or pending-reply chats first, then one with busy work, then one with the latest conversation activity; manual order resolves equal ranks (`chat-list.ts:415-504`).
- Activity age for collapsing sections excludes a read-only `updatedAt` when it is within two seconds of `lastReadAt`; idle hiding instead counts `lastReadAt` as access (`chat-list.ts:131-160`, `chat-list.ts:180-199`).
- The “Show hidden” switch controls visibility of hidden project/section rows; the sidebar reads `prefs.view.showHidden` and each row’s `hidden` item style, while the management page uses the same item flag (`app.tsx:2221-2233`, `app.tsx:2455-2459`, `app.tsx:2553-2562`, `app.tsx:3089-3100`). Its preference is described in [Appearance and preferences](appearance-settings.md) and [Project and section tree](project-tree.md#modes).

## Public API

| RPC | Purpose | Evidence |
|---|---|---|
| `list` | Return folders, roots, environment bindings, manual placements, hosts and export errors | `server.ts:2484-2544` |
| `thread_place`, `thread_place_clear` | File a chat in the tree without changing its workspace, or clear its manual placement | `server.ts:228-240`, `server.ts:2297-2326` |
| `prefs_get`, `prefs_save` | Read/save shared list and view preferences | `server.ts:585-600` |
| `reorder` | Persist the complete project order or sibling section order | `server.ts:411-425`, `server.ts:3244-3290` |

## Gotchas

- A folded branch hides its chats from the page, but they still count for the short list and idle hiding of their root.
- Opening a chat alone does not promote it by activity because matching `updatedAt` and `lastReadAt` values are treated as reads (`chat-list.ts:180-199`).
- A collapsed list filters by recency before applying the limit; expanded lists return the complete sorted list (`chat-list.ts:163-177`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Project and section tree](project-tree.md)
