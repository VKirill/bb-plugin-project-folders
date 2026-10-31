## Now
- Organize chats into projects, nested folder-backed sections, and groups across connected devices, placing chats from working folders while preserving explicit placements and resolving shared ancestor/child folders to the parent section; new projects and sections get lean default AGENTS.md rules.
- Manage project, section, group, and chat actions, including subtree mark-as-read, compact row menus, moves, visibility controls, archives, restore, and history exports; project and section cards use menu actions, underline tabs, compact rules, and working custom-rule saves.
- On phones the sidebar tree gives the chat title most of the row width: no Inactive pill at any width, non-inactive chat status as a dot on the provider icon, row menu by long press (⋯ only on the active row), 8px nesting step, and an icon-only «Новый проект» button.
- Configure per-place agent rules, execution defaults including inherited folder/worktree environment and machine pins with BB-named device choices, appearance, and language resolved from saved choice, then page language, then device language, then English, plus optional session-context filtering; export and restore all durable plugin data and settings as JSON, preserving IDs across replace or merge imports.
- Keep pinned Claude threads warm with configurable prompt-cache keepalive turns before cache expiry, even when queued messages are scheduled for after expiry; keepalive is opt-in, and message dispatch fails open on internal errors.

## Blocked
- None.

## Next
- [ ] Integrate origin/main and prepare release 0.7.11 (`.agents/plans/items/release-0.7.11/PLAN.md`).
- [ ] Optional physical-iOS pass on the long-press menu and dot rendering (QA case T1-UI-3) when a device is available.

## Last verify
- command: Lane Pilot acceptance for mobile-compact-tree (contract UI cases, locale fallback probe, typecheck, docs check)
- result: green (accepted, attempt 1)
- when: 2026-10-31

## Pointers
- Open todos: none (`.agents/todos/INDEX.md` not present).
- Active plans: release-0.7.11, Integrate origin/main and prepare release 0.7.11 (`.agents/plans/items/release-0.7.11/PLAN.md`).
- Changelog: `.agents/CHANGELOG.md`.
