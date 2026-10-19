---
title: Chat history export
type: component
created: 2026-09-27
updated: 2026-10-19
status: active
confidence: high
tags: [history, export, snapshots]
sources:
  - server.ts
  - export-queue.ts
  - archive.ts
  - thread-move.ts
  - README.md
---
# Chat history export

TL;DR: The plugin exports BB chat timelines as paginated JSON snapshots beneath the section’s `.bb/chats/<threadId>` directory; BB remains the canonical chat store (`server.ts:1903-1911`, `server.ts:1947-1962`).

## Purpose

Exports provide files for project workflows while BB retains canonical thread data (`server.ts:1947-1962`, `server.ts:2007-2017`).

## How it works

1. A manual `sync` or automatic lifecycle event enters the sync function; active moves and archives suppress export (`server.ts:2029-2060`).
2. The exporter resolves the chat’s section and environment, reads the first timeline page and can skip an unchanged automatic export when the digest and snapshot match (`server.ts:1852-1882`, `server.ts:1930-1946`).
3. It writes thread metadata, then walks older timeline pages with a limit of 20 segments and yields between pages (`server.ts:1947-1984`).
4. It writes the snapshot index only after all pages finish, removes the previous snapshot, writes a README and creates `artifacts/`, `notes/` and `tmp/` (`server.ts:1985-2017`).
5. Export status is stored by thread ID; deleted threads are removed, transient missing environments are not recorded, and other errors are stored for retry (`server.ts:2018-2022`, `server.ts:2044-2056`).
6. The persistent queue coalesces bursts, serializes exports, applies a cooldown and retries failures after at least 60 seconds (`export-queue.ts:13-45`).

## Modes

| Mode | Trigger | Behavior |
|---|---|---|
| Automatic | Thread creation/turn/archive lifecycle | Delay and cooldown queue; unchanged snapshots skipped |
| Manual | `sync` RPC or CLI | Full export traversal; does not use unchanged-head skip |
| Blocked | Thread move or archive in progress | Returns an empty path until operation settles |

Evidence: `server.ts:1930-1946`, `server.ts:2029-2043`, `server.ts:3632-3673`, `export-queue.ts:13-15`.

## Failures

| Failure | Result |
|---|---|
| Thread not found | A not-found/404 rejection deletes the thread's export row, then the sync call still rejects (`server.ts:2051-2063`). |
| Environment is missing transiently | An error whose text includes `environment` is not written to the export error row; the sync call still rejects (`server.ts:2051-2063`). |
| Other export failure | The error and current timestamp are written to the export row, then the sync call rejects; the queue retries after its minimum retry delay (`server.ts:2051-2063`, `export-queue.ts:32-45`). |
| Chat is moving or archived | Sync returns an empty path and waits for the operation to settle (`server.ts:2029-2043`, `server.ts:3635-3649`). |

## Business rules

- Each snapshot uses `history/<snapshot>/page-00000.json` and a newest-first index (`server.ts:1975-1996`).
- The new snapshot index is written after page traversal; an older snapshot is deleted only after the new index exists (`server.ts:1985-2006`).
- Automatic requests for the same thread coalesce; one export runs at a time (`export-queue.ts:16-45`).
- The exported timeline is a copy; export metadata and the generated README identify BB’s database as the canonical chat store (`server.ts:1947-1962`, `server.ts:2007-2009`).

## Public API

| RPC / command | Purpose | Evidence |
|---|---|---|
| `sync` | Manually export one thread’s history | `server.ts:584-587` |
| `bb project-folders sync <thread-id>` | CLI form of manual export | `server.ts:3888-3891`, `server.ts:4094-4098` |

## Gotchas

- The export traverses the full history, not an incremental archive; the automatic digest check only skips an unchanged snapshot (`server.ts:1930-1946`, `server.ts:1963-1984`).
- If an export fails during a move or archive, it is deferred until the operation releases its block (`server.ts:2029-2043`, `server.ts:3635-3649`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Data model](../data-model.md)
