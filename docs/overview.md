---
title: Projects & Sections — Overview
type: overview
created: 2026-09-27
updated: 2026-09-27
status: active
confidence: medium
tags: [bb-plugin, overview, project-folders]
sources:
  - package.json
  - server.ts
  - app.tsx
  - host.ts
  - section-tree.ts
  - archive.ts
  - execution.ts
  - session-policy.ts
  - preferences.ts
---
# Projects & Sections — Overview

TL;DR: Projects & Sections adds a folder-backed hierarchy of sections and chats to BB projects, with controls for chat creation, rules, execution defaults, archives, device copies, appearance and session context (`package.json:9-17`, `server.ts:684-718`).

## What it is

This repository is a BB plugin named **Projects & Sections**. Its package manifest points BB to a server entry, a React app entry and a host entry; BB and the Plugin SDK minimum versions are declared in the `engines` field (`package.json:5-17`).

BB remains responsible for projects, threads, environments and host connections. The plugin stores section metadata and configuration in BB plugin storage, and calls BB SDK methods for thread operations and remote file access (`server.ts:684-718`, `server.ts:1752-1760`, `host.ts:7-16`).

The product has three main parts: the app renders the section tree and management settings (`app.tsx:1-70`); the plugin server owns RPC handlers, state and lifecycle integration (`server.ts:187-602`, `server.ts:631-690`); the host entry performs local filesystem operations on the selected machine (`host.ts:7-16`). Supporting modules implement archives, move journals, rule templates, execution defaults, session policies, preferences and chat-history exports (`archive.ts:50-72`, `execution.ts:3-12`, `session-policy.ts:3-14`, `preferences.ts:3-7`).

## Stack

- TypeScript with ES modules (`package.json:2-4`).
- BB Plugin SDK `0.4.104` for development and BB `>=0.43.3` / SDK `>=0.4.84` engine requirements (`package.json:5-7`, `package.json:26-28`).
- React `^19.3.0` and Zod `^4.3.6` (`package.json:19-25`, `package.json:50-52`).
- Vitest `^5.0.0` for tests and the BB CLI for builds (`package.json:80-84`).
- BB-managed SQLite storage and host file APIs (`server.ts:684-718`, `host.ts:7-16`).

## Quick start

From the repository root, run `npm ci`, then `npm run typecheck`, `npm test`, and `npm run build` (`package.json:80-84`). Installation and BB configuration are in [Deployment](deployment.md).

## Where to look next

- [Architecture](architecture.md) — plugin parts and BB integration.
- [API](api.md) — RPC operations, cross-plugin section listing, host operations and CLI commands.
- [Data model](data-model.md) — stored tables, keys, ownership and cleanup.
- [Features](features/project-tree.md) — user-facing behavior by capability.
- [Gotchas](gotchas.md) — constraints and failure behavior.

<!-- lane-pilot:backlinks -->
## Referenced by

- [Deployment](deployment.md)
