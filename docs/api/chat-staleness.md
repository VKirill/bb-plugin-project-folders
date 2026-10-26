---
title: Chat staleness predicate
type: component
created: 2026-10-26
updated: 2026-10-26
status: active
confidence: high
tags: [auto-archive, chats, eligibility]
sources:
  - auto-archive.ts
---
# Chat staleness predicate

TL;DR: `isStale` returns true only for an unpinned, childless, quiet chat with no queued or pending work and a recorded activity time at least the configured number of days old (`auto-archive.ts:73-110`).

## Purpose

`isStale(thread, config, now)` is the eligibility predicate used by the auto-archive sweep. It only decides whether a thread qualifies; listing and archiving occur in the sweep (`auto-archive.ts:92-112`, `auto-archive.ts:120-164`).

## How it works

1. Reject archived or deleted threads, pinned threads and child threads (`auto-archive.ts:97-100`).
2. Accept only quiet thread and runtime display states (`idle` or `error`); reject pending interaction, queued work other than `none`, and any positive activity counter (`auto-archive.ts:100-107`).
3. Compute the latest activity timestamp from `updatedAt`, `latestAttentionAt` and `createdAt`, treating absent/falsy values as zero (`auto-archive.ts:73-85`).
4. Return false if that timestamp is zero. Otherwise compare `now - last` against `config.days * DAY_MS`; the boundary is inclusive (`auto-archive.ts:108-110`).

| Predicate branch | Condition | Result |
|---|---|---|
| Lifecycle exclusion | Archived or deleted | `false` (`auto-archive.ts:97`). |
| Structural exclusion | Pinned or has a parent thread | `false` (`auto-archive.ts:98-100`). |
| Busy/waiting exclusion | Thread/runtime state is not quiet, interaction is pending, queued work is nonempty and not `none`, or activity is positive | `false` (`auto-archive.ts:100-107`). |
| No timestamp | All activity times are missing/falsy | `false` (`auto-archive.ts:73-85`, `auto-archive.ts:108-109`). |
| Old enough | Last activity is at least `days` 24-hour periods before `now` | `true` (`auto-archive.ts:108-110`). |
| Not old enough | Last activity is newer than the threshold | `false` (`auto-archive.ts:108-110`). |

## Business rules

- `error` is a quiet terminal state for this predicate, alongside `idle` (`auto-archive.ts:100-103`).
- A zero timestamp never qualifies, even when the configured threshold is zero (`auto-archive.ts:108-110`).
- Predicate evaluation has no catch branch; it returns a boolean for supported thread/config values (`auto-archive.ts:92-110`).

## Public API or commands

Internal function: `isStale(thread, config, now): boolean`, exported from `auto-archive.ts` (`auto-archive.ts:92-96`).

## Gotchas

- A change to any of `updatedAt`, `latestAttentionAt` or `createdAt` can move the comparison timestamp because the predicate uses their greatest value (`auto-archive.ts:73-85`).
- The sweep owns the config default/range and archives qualifying threads sequentially (`auto-archive.ts:3-12`, `auto-archive.ts:142-164`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [RPC and host contract behavior](../api-contracts.md)
- [API and commands](../api.md)
