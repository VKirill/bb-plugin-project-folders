---
title: Chat list and activity
type: component
created: 2026-09-27
updated: 2026-11-16
status: active
confidence: high
tags: [chat-list, activity, sidebar, nested-chats]
sources:
  - chat-list.ts
  - chat-tree.ts
  - thread-status.ts
  - app.tsx
  - preferences.ts
---
# Chat list and activity

The sidebar groups BB chats by project and section, then draws forks and child chats below their parent. Relationships are read from BB; the plugin never reparents chats. The implementation is in [chat-tree.ts](../../chat-tree.ts) and [app.tsx](../../app.tsx).

## Branches and ordering

- A parent and child nest only inside the same displayed list. A missing, archived or cross-section parent leaves the child as a root in its own list.
- Every chat appears once, including duplicate input IDs, self-parent links and parent cycles. The first cycle member in incoming sort order becomes its displayed root.
- A pinned chat promotes its whole ancestor branch; pinned siblings stay first. Activity ordering uses the newest update, attention or creation timestamp anywhere in a branch. Title and creation ordering otherwise keep the existing sibling order.
- The title opens exactly that chat. The separate arrow folds its branch. Context menus, rename and drag and drop continue targeting the selected chat alone.

## Short lists and idle hiding

The configured limit of 1–100 counts actual displayed rows. A quiet branch with 1,000 children does not mount all of them by default. Idle hiding applies to individual chats; their ancestors remain when needed to reach a retained child.

Pinned, unread, busy and currently open chats bypass the short-list limit together with their ancestor path. This exception applies equally to roots and descendants. The existing `isThreadBusy` visibility predicate includes attention indicators, so failures and input requests cannot disappear behind the age filter or row budget.

**Show all** reveals the rest of that list and disables idle hiding for it. Expanding an individual branch explicitly reveals that branch beyond the budget and age filter. Neither action opens a descendant the user manually folded. These explicit expansions and important-chat exceptions can exceed the configured limit.

## Hidden counts and statuses

A branch with hidden descendants shows their count, excluding descendants already drawn elsewhere in that branch. Unread state remains visible. Actual execution and attention are resolved through the existing `threadStatus` helper: failures take priority over input requests, which take priority over running work. A completed unread result is not labelled as running.

The row switches between status words and accessible markers using its own width, not the viewport width. CSS container queries account for the row's own status and device badge; the same theme tokens work in Pokecut and Default, light and dark. Labels use the existing locale dictionaries.

## Browser state and navigation

Manual folds are stored as chat IDs in `project-folders:collapsed-chats`. Missing or malformed state starts with no manual folds; blocked storage keeps changes for the current page only. Explicit budget overrides last for the mounted sidebar.

Opening another chat unfolds only its displayed ancestor chain, once. A later manual fold remains until the user reopens the chat or expands the branch. Missing list entries during an update do not undo manual choices. Folds in other sections and behind archived parents are left alone.

Both tree construction and row projection are iterative. Rows are rendered as sibling wrappers with depth-based logical indentation, so chat depth does not consume the JavaScript call stack.

## Existing section behavior

Section auto-collapse remains independent of chat folding. Active or open chats keep automatically managed sections open, while a manual section fold wins. Activity ordering ranks sections by unread reply, then work, then conversation activity; projects keep their manually configured order.

Manual chat placement overrides the environment's section. Returning a chat to its working folder clears that placement. Hidden projects and sections follow the existing appearance settings.

## Validation

- [chat-tree.test.ts](../../chat-tree.test.ts): grouping, cycles, visibility, idle hiding and deep chains.
- [chat-tree-regression.test.ts](../../chat-tree-regression.test.ts): completed/error/waiting summaries, recent children and pinned branches.
- [nested-chats.test.tsx](../../nested-chats.test.tsx): real click handlers, fold persistence, navigation, row budgets, explicit expansion, attention labels, a 20,000-chat chain, menus and dragging.
- Existing thread-row, mobile, display, placement and localization tests cover shared behavior.

Live browser checks are required for CSS, hit targets, responsive layout and compatibility with the running BB shell; jsdom does not establish those results.
