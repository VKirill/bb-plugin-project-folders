---
title: Deployment
type: deployment
created: 2026-09-27
updated: 2026-10-09
status: active
confidence: medium
tags: [deployment, installation, development]
sources:
  - package.json
  - tsconfig.json
  - server.ts
  - app.tsx
  - host.ts
  - session-policy-server.ts
---
# Deployment

TL;DR: Install the plugin through the BB CLI; for repository development install locked dependencies with npm and use the package scripts for type checking, tests and BB CLI build (`package.json:80-84`).

## Prerequisites

- BB `>=0.43.3` and BB Plugin SDK `>=0.4.104` (`package.json:4-7`).
- Node.js/npm compatible with the lockfile, plus the `bb` CLI for building and installing (`package.json:80-84`).
- Connected devices with local-path project sources for folder operations. The plugin’s host contract carries file operations to a selected host (`host.ts:7-16`).

## Deploy procedure

1. Install the plugin from the repository declared in the package metadata: `bb plugin install https://github.com/VKirill/bb-plugin-project-folders.git --yes` (`package.json:2-3`, `package.json:72-76`). See [Overview](overview.md) for the plugin’s identity and [API and commands](api.md) for its BB CLI surface.
2. For local development, run `npm ci` from the repository root.
3. Run `npm run typecheck` to execute `tsc --noEmit` (`package.json:80-83`).
4. Run `npm test` to execute `vitest run` (`package.json:80-83`).
5. Run `npm run build` to execute `bb plugin build` (`package.json:80-84`).
6. In BB, select Projects & Sections as the sidebar thread list when it is not selected automatically, then open its management page and create a project.

## Configuration

The package manifest declares `server.ts`, `app.tsx` and `host.ts` as the plugin’s server, app and host entries (`package.json:9-18`). Plugin state is initialized and migrated in the server through `bb.storage.database()` and `bb.storage.migrate()` (`server.ts:684-718`). User-facing settings are managed inside the plugin interface; the old declarative rules settings are read once for migration and are not re-registered (`server.ts:631-683`).

Session-context filtering appears only when BB provides `experimental_vkSessionPolicy` (`session-policy-server.ts:52-68`, `session-policy-server.ts:144-150`).

## Verify

- Confirm the package build exits successfully with `npm run build` (`package.json:80-84`).
- In BB, confirm the management page loads the project/section list; the app refreshes on `changed`, and the server registers the main and read-only section-list RPC contracts (`app.tsx:359`, `server.ts:3540-3564`).
- For session context, read `session_policy_capability`; its handler returns the session-policy subsystem's availability value (`server.ts:2157-2159`).

## Rollback

The repository defines no rollback script or automated database downgrade (`package.json:80-84`, `server.ts:684-718`). Remove or roll back the plugin using the BB plugin management interface or CLI supported by the installed BB version; retain the BB plugin database backup if state recovery is required.

## Troubleshooting

- `bb plugin build` fails: verify BB CLI availability and SDK engine compatibility (`package.json:5-7`, `package.json:80-84`).
- A project section cannot be used for a chat: confirm it belongs to the selected project, has a path on the selected host and is not a group, moving or being archived (`server.ts:3655-3691`).
- Session-context settings are unavailable: the running BB build does not expose the experimental session-policy extension (`session-policy-server.ts:52-68`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Projects & Sections — Overview](overview.md)
