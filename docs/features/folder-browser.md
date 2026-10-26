---
title: Folder browser
type: component
created: 2026-10-25
updated: 2026-10-26
status: active
confidence: high
tags: [folder-browser, projects, filesystem]
sources:
  - folder-browser.tsx
  - server.ts
  - folder-files.ts
  - app.tsx
---
# Folder browser

TL;DR: The folder browser renders caller-provided directory listings and path navigation, and sends create/delete requests through `folder_edit` for its selected host (`folder-browser.tsx:9-56`, `app.tsx:722-745`, `server.ts:2553-2599`).

## Purpose

`FolderBrowser` renders directory navigation and empty-folder management inside project and section folder dialogs. Its caller supplies the current host, path, parent, directory list, loading state and callbacks (`folder-browser.tsx:9-27`, `app.tsx:722-745`, `app.tsx:1303-1316`).

## How it works

1. The caller loads the current listing and passes `path`, `parent`, `directories`, `loading`, `navigate`, `refresh` and `onBusyChange`. The project and section dialogs load listings through `project_browse`; navigation invokes the caller callback, which requests the next listing (`folder-browser.tsx:9-27`, `app.tsx:722-745`, `app.tsx:1303-1316`). While a request is loading or an edit is pending, the component disables browser controls (`folder-browser.tsx:39-40`).
2. The toolbar shows the current path, enables parent navigation only when `parent` exists, and opens the create form. A directory row navigates into its path; its trash action switches to a confirmation for that child (`folder-browser.tsx:59-88`, `folder-browser.tsx:135-167`).
3. Create accepts a trimmed nonempty name through Enter or the check button. Escape and Cancel close the form when no request is busy (`folder-browser.tsx:90-133`).
4. Delete requires the explicit confirmation. Both operations call the shared `edit` function, which marks the caller and component busy, clears the old error, sends `folder_edit` with `hostId`, current path as `parent`, name and action, then clears forms and refreshes on success. Rejection is shown in an alert; `finally` always clears busy state (`folder-browser.tsx:40-56`, `folder-browser.tsx:169-205`).
5. The server rejects invalid parent/name input and offline hosts. For deletion it also builds protected paths from registered sections and BB local project sources, refusing an exact match before forwarding the operation to the selected host (`server.ts:2553-2599`).
6. The host resolves the parent path, creates a directory for `create`, or checks protected paths and removes an empty real directory for `delete` (`folder-files.ts:3-40`).

The component owns form and busy/error state, while its caller owns listing and navigation state. A successful edit closes the active form and refreshes the supplied listing; an RPC rejection remains visible in the component alert and does not refresh the listing (`folder-browser.tsx:40-55`, `folder-browser.tsx:201-205`).

| Mode/state | Condition | Result or failure |
|---|---|---|
| Browsing | Not loading, not busy, no delete confirmation | Child directories navigate; an empty listing displays “No nested folders.” (`folder-browser.tsx:135-168`) |
| Creating | User opens the new-folder control | Enter/check submits a trimmed nonempty name; Escape/Cancel closes the form (`folder-browser.tsx:73-84`, `folder-browser.tsx:90-133`). |
| Delete confirmation | User selects a directory’s trash action | Cancel returns to the listing; Delete submits the selected child name. The prompt explains that only empty folders can be removed (`folder-browser.tsx:151-165`, `folder-browser.tsx:169-199`). |
| Busy | Listing or edit request is in flight | Navigation, inputs and edit actions are disabled; caller receives the busy state (`folder-browser.tsx:39-42`, `folder-browser.tsx:53-55`). |
| RPC/host error | Request rejects | The message is rendered as an alert and controls become available after the request settles (`folder-browser.tsx:50-55`, `folder-browser.tsx:201-205`). |
| Empty directory deletion | Target is missing, protected, not a directory, a symlink or nonempty | Host validation rejects the operation; protected registered folders require their archive action (`folder-files.ts:22-38`, `server.ts:2565-2594`). |
| Listing navigation | User selects parent or a child directory | Calls `navigate(path)`; the caller reloads `project_browse` and controls the loading state (`folder-browser.tsx:59-67`, `folder-browser.tsx:135-150`, `app.tsx:740-745`). |
| Edit succeeds | Host returns a path | Close create/delete UI, clear the name, and refresh the caller's listing (`folder-browser.tsx:44-49`). |
| Edit rejects | RPC, host dispatch, or filesystem call rejects | Keep an alert with the error message; release busy state in `finally` (`folder-browser.tsx:50-55`, `folder-browser.tsx:201-205`). |

## Business rules

- Folder names cannot be blank, padded with surrounding whitespace, `.`/`..`, or contain slash, backslash or control characters; the parent must be an absolute existing path (`folder-files.ts:9-19`).
- Delete removes only an empty directory and cannot remove an exact registered project or section path (`server.ts:2565-2594`, `folder-files.ts:22-38`).
- A folder edit is sent to the host selected by `hostId`; a disconnected host fails before the host contract call (`server.ts:2561-2564`, `server.ts:2596-2599`).

## Public API or commands

| Operation | Input/output | Evidence |
|---|---|---|
| `project_browse` RPC | Host and optional path; returns canonical path, parent path and visible child directories (`server.ts:297-304`, `server.ts:2600-2612`). |
| `folder_edit` RPC | Host, parent path, name and `create` or `delete`; returns the resulting path (`server.ts:288-296`). |
| Host `folder_edit` | Same action and parent/name plus protected paths for deletion; creates a directory or removes an empty one (`folder-files.ts:3-40`). |

## Gotchas

- The browser displays only the directory list supplied by its caller; the server listing filters out hidden dot directories (`server.ts:2605-2612`).
- Deleting a project or section folder is handled by its archive/removal flow, not this empty-folder control (`folder-browser.tsx:175-181`, `server.ts:2580-2594`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Project and section tree](project-tree.md)
