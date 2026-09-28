---
title: Gotchas
type: gotchas
created: 2026-09-27
updated: 2026-09-28
status: active
confidence: medium
tags: [gotchas, constraints, operations]
sources:
  - server.ts
  - thread-move.ts
  - session-policy-server.ts
  - session-policy.ts
  - archive.ts
  - move-files.ts
  - chat-list.ts
  - section-move.ts
  - section-tree.ts
---
# Gotchas

TL;DR: The sharp edges are tied to the physical device behind each section, asynchronous file moves, BB’s chat directory update support, and an experimental core hook for session-context filtering (`thread-move.ts:138-168`, `session-policy-server.ts:52-68`).

## Critical

### A chat move can update the tree before its working directory changes

**Problem:** If BB rejects its experimental directory update, the plugin asks the chat’s own agent to switch directories using an agent-only message. It files the chat immediately, then settles the move after the request turn; a provider without the directory tool leaves the chat working in its old folder (`thread-move.ts:138-168`, `thread-move.ts:216-269`).

**Risk:** The displayed destination and actual working directory can differ until the agent completes the requested move.

**Workaround:** Check the device badge/path and the move result; do not assume the workspace changed until it has settled (`thread-move.ts:228-269`).

### Directory moves do not merge or overwrite occupied destinations

**Problem:** The section move checks source and destination existence. If both exist, it calls host `inspect` and accepts the pair only when the source is a compatibility link from a completed move (`section-move.ts:243-266`).

**Risk:** A retry can stop with a persisted journal and require operator resolution of the two paths.

**Workaround:** Inspect both folders and resolve the collision before retrying the pending move (`section-move.ts:243-266`). The section-move catch records the error in its journal and rethrows it (`section-move.ts:347-353`).

## High

### Session context depends on an experimental BB extension

**Problem:** Rules are registered with BB only if `experimental_vkSessionPolicy` exists; without it the capability is false and no resolver is registered (`session-policy-server.ts:52-68`, `session-policy-server.ts:144-150`).

**Risk:** Persisted settings do not enforce session filtering on a BB build without this hook.

**Workaround:** Check the capability before relying on a session restriction (`server.ts:482-485`).

### Required plugins and MCP servers cannot be excluded

**Problem:** `environment-project-checkout`, `project-folders` and `bb-bridge` are fixed required session items (`session-policy.ts:32-47`). Normalization removes them from saved filters and conversion back to core retains them (`session-policy.ts:118-141`, `session-policy.ts:172-201`).

**Risk:** An allow/deny list cannot disable infrastructure required for BB threads or this plugin.

**Workaround:** Treat those entries as invariant when interpreting session-context results (`session-policy.ts:32-47`).

## Medium

### A group has no folder and cannot own a chat or rules

**Problem:** A group is represented in the section tree but has no filesystem location (`server.ts:234-240`, `section-tree.ts:8-11`). Section-environment validation refuses it (`server.ts:3340-3348`).

**Risk:** Passing a group ID where a section ID is required fails instead of starting a chat.

**Workaround:** Select a real section nested under the group (`server.ts:3340-3348`).

### Archiving blocks active work and keeps external folders in place

**Problem:** Archive checks chat activity, queued work, child chats, overlapping projects and nested sections before moving. A section whose path is outside the project archive root keeps its files in place (`archive.ts:128-218`, `archive.ts:285-331`).

**Risk:** Archive is rejected while work runs; an archived tree entry does not always mean its directory moved.

**Workaround:** Finish chats and resolve nested/external ownership before retry; check archive metadata when restoring (`archive.ts:219-240`, `archive.ts:294-331`).

## Low

### Reading a chat does not count as activity for recency sorting

**Problem:** The activity calculation ignores `updatedAt` when it is within two seconds of `lastReadAt`, because BB updates both when a thread is opened/read (`chat-list.ts:180-199`).

**Risk:** Opening a chat alone does not promote it by conversation activity.

**Workaround:** Interpret activity order as message/attention recency, not last-opened order (`chat-list.ts:180-199`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Projects & Sections — Overview](overview.md)
