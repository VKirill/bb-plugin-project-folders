---
title: Projects & Sections — Project facts
updated: 2026-10-26
sources:
  - package.json
  - server.ts
  - app.tsx
  - components/ui/hooks/use-compact-viewport.tsx
  - host.ts
  - repo-remote.ts
  - project-delete.ts
  - section-remove.ts
  - auto-archive.ts
  - cache-keepalive.ts
  - section-move.ts
  - docs/architecture.md
  - docs/gotchas.md
  - docs/api.md
---
# Identity

- BB plugin package: `bb-plugin-project-folders`; product name: Projects & Sections (`package.json:2-17`).
- TypeScript ES module; BB `>=0.43.3`; SDK `>=0.4.104` (`package.json:4-7`).
- Plugin entries: `server.ts`, `app.tsx`, `host.ts` (`package.json:9-18`).
- License: MIT (`package.json:70`).

## Entry points

- Server: RPC contract, persistence, BB SDK integration, CLI commands — [API](docs/api.md), [architecture](docs/architecture.md) (`server.ts:194-628`, `server.ts:650-737`).
- App: sidebar, management surfaces and settings; project and section headings switch actions at the compact viewport breakpoint (`app.tsx:1-70`, `app.tsx:2031-2155`, `components/ui/hooks/use-compact-viewport.tsx:16-27`).
- Host: filesystem, move/link, repository remote and session inventory operations (`host.ts:8-18`, `repo-remote.ts:187-198`).
- Domain modules: archive, project move, section move, thread move, preferences, execution, session policy and export queue — [data model](docs/data-model.md), [features](docs/features/project-tree.md).

## Critical invariants

- Groups are organizational nodes with synthetic paths; use a real section for a chat environment (`server.ts:2255-2281`, `server.ts:3706-3714`).
- The composer accepts a section only when it belongs to the selected project, is a real folder section, has a path binding on the chosen host, and is not moving or archiving (`server.ts:3697-3733`).
- Filesystem section moves persist a journal before changing files; failures retain an error for retry (`section-move.ts:279-304`, `section-move.ts:358-364`).
- Project deletion and its file-retention constraints: [project and section tree](docs/features/project-tree.md#how-it-works).
- Section removal modes, preconditions and chat/file outcomes: [section archive and restore](docs/features/archive-and-restore.md#modes) (`section-remove.ts:48-79`).
- Automatic chat-archive eligibility, sweep behavior and RPC settings: [section archive and restore](docs/features/archive-and-restore.md#automatic-chat-archiving) (`auto-archive.ts:92-172`, `server.ts:636-647`).
- Section rename and path changes use separate operations: [project and section tree](docs/features/project-tree.md#how-it-works).
- `.bb/chats/<threadId>` contains an automatically updated timeline snapshot; the export metadata and README identify BB’s database as canonical (`server.ts:1947-1962`, `server.ts:2007-2009`).
- Session-context filtering requires BB’s experimental extension (`session-policy-server.ts:52-75`).
- Prompt cache keepalive is disabled by default and targets eligible pinned Claude-family chats: [cache keepalive](docs/features/cache-keepalive.md) (`cache-keepalive.ts:10-14`, `cache-keepalive.ts:218-240`).

## Conventions

- Run package scripts through `npm run typecheck`, `npm test`, and `npm run build` (`package.json:80-84`).
- Runtime paths cross the host boundary via `moveHostContract`; host handlers are in `host.ts` (`host.ts:5-16`).
- RPC inputs and outputs are defined with Zod in `server.ts` (`server.ts:194-628`).
- User-facing feature ownership and behavior: [features](docs/features/project-tree.md).

## Common gotchas

- A fallback chat relocation requires one agent turn and a provider with the `update_environment_directory` tool ([gotchas](docs/gotchas.md#critical), `thread-move.ts:138-168`).
- Occupied move destinations are not merged or overwritten (`section-move.ts:266-277`).
- Required session items cannot be excluded (`session-policy.ts:32-47`).

## Useful commands

| Command | Purpose |
|---|---|
| `npm ci` | Install locked dependencies. |
| `npm run typecheck` | TypeScript check (`package.json:80-83`). |
| `npm test` | Run Vitest (`package.json:80-83`). |
| `npm run build` | Build with BB CLI (`package.json:80-84`). |
| `bb project-folders list` | List sections and project roots (`server.ts:3830-3832`, `server.ts:3928-3929`). |
| `bb project-folders sync <thread-id>` | Export a chat history snapshot (`server.ts:3885-3887`, `server.ts:4091-4092`). |

## Where to look next

- [Architecture](docs/architecture.md)
- [API](docs/api.md)
- [Data model](docs/data-model.md)
- [Feature pages](docs/features/project-tree.md)
- [Prompt cache keepalive](docs/features/cache-keepalive.md)
