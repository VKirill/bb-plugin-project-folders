import { listAll } from "./list-all";
import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Folder } from "./server";
import { busyThread } from "./archive";
import { userError } from "./user-error";

export const sectionRemoveMode = ["archive", "unbind", "purge"] as const;
export type SectionRemoveMode = (typeof sectionRemoveMode)[number];

const within = (p: string, r: string) =>
  p === r || p.startsWith(r.endsWith(path.sep) ? r : r + path.sep);

function isGroup(f: { kind?: string } | null | undefined) {
  return f?.kind === "group";
}

function withNestedGroups(all: Folder[], members: Folder[]): Folder[] {
  const ids = new Set(members.map((m) => m.id));
  const out = [...members];
  for (let added = true; added;) {
    added = false;
    for (const g of all)
      if (isGroup(g) && !ids.has(g.id) && g.parentId && ids.has(g.parentId)) {
        ids.add(g.id);
        out.push(g);
        added = true;
      }
  }
  return out;
}

async function threadInventory(bb: BbPluginApi, projectId: string) {
  const result: Awaited<ReturnType<typeof bb.sdk.threads.list>> = [];
  for (const archived of [false, true]) {
    for (let offset = 0; ; offset += 200) {
      const page = await bb.sdk.threads.list({
        projectId,
        includeHidden: true,
        archived,
        limit: 200,
        offset,
      });
      result.push(...page);
      if (page.length < 200) break;
    }
  }
  return result;
}

export async function removeSection(
  bb: BbPluginApi,
  deps: {
    folders: () => Folder[];
    root: (projectId: string, hostId: string) => Promise<Folder>;
    canonical?: (hostId: string, path: string) => string;
    sync: (id: string) => Promise<unknown>;
    pending: () => Promise<unknown>;
    pendingArchives: (projectId: string) => boolean;
    sectionMoving: (folderId: string) => boolean;
    chatMoving: () => boolean;
    dropMembers: (members: Folder[]) => void;
    forgetGithub: (hostId: string, path: string) => void;
    changed: () => void;
    archive: (folderId: string) => Promise<unknown>;
  },
  input: { folderId: string; mode: SectionRemoveMode },
) {
  const f = deps.folders().find((x) => x.id === input.folderId);
  if (!f || isGroup(f))
    throw userError("sec_group_no_folder", { section: f?.name ?? "" });
  if (deps.chatMoving()) throw userError("sec_chat_moves_pending", { section: f.name });
  if (deps.sectionMoving(f.id))
    throw userError("sec_section_move_unfinished", { section: f.name });
  if (deps.pendingArchives(f.projectId))
    throw userError("sec_archives_pending", { section: f.name });
  if (input.mode === "archive") {
    deps.forgetGithub(f.hostId, f.path);
    await deps.archive(f.id);
    return { ok: true as const, mode: input.mode };
  }

  const all = deps.folders();
  const members = withNestedGroups(
    all,
    all.filter(
      (c) =>
        !isGroup(c) &&
        c.projectId === f.projectId &&
        c.hostId === f.hostId &&
        (c.id === f.id || (c.path !== f.path && within(c.path, f.path))),
    ),
  );
  const memberIds = new Set(members.map((m) => m.id));
  if (
    all.some(
      (c) => c.parentId && memberIds.has(c.parentId) && !memberIds.has(c.id),
    )
  )
    throw userError("sec_members_elsewhere", { section: f.name });

  const otherProjects = await bb.sdk.projects.list();
  const nestedProject = otherProjects.some(
    (p) =>
      p.id !== f.projectId &&
      p.sources.some(
        (source) =>
          source.type === "local_path" &&
          source.hostId === f.hostId &&
          within(source.path, f.path),
      ),
  );
  if (input.mode === "purge" && nestedProject)
    throw userError("sec_nested_project_purge", { section: f.name });

  const pathShared = all.some(
    (c) =>
      c.id !== f.id &&
      !isGroup(c) &&
      c.hostId === f.hostId &&
      c.path === f.path,
  );
  if (input.mode === "purge" && pathShared)
    throw userError("sec_purge_shared_path", { section: f.name, path: f.path });

  const root = await deps.root(f.projectId, f.hostId);
  const insideProject = within(f.path, root.path);
  if (input.mode === "purge" && !insideProject)
    throw userError("sec_purge_outside_project", { section: f.name, path: f.path });

  const envs = await listAll((p) => bb.sdk.environments.list(p));
  if (
    input.mode === "purge" &&
    envs.some(
      (e) =>
        e.projectId !== f.projectId &&
        e.hostId === f.hostId &&
        e.path &&
        within(deps.canonical?.(e.hostId, e.path) ?? e.path, f.path) &&
        e.status === "ready",
    )
  )
    throw userError("sec_foreign_env", { path: f.path });
  const envIds = new Set(
    envs
      .filter(
        (e) =>
          e.hostId === f.hostId &&
          e.path &&
          within(deps.canonical?.(e.hostId, e.path) ?? e.path, f.path),
      )
      .map((e) => e.id),
  );
  const threads = await threadInventory(bb, f.projectId);
  const dbPlaces = (
    bb.storage
      .database()
      .prepare("SELECT threadId, folderId FROM thread_places")
      .all() as { threadId: string; folderId: string | null }[]
  ).reduce<Record<string, string | null>>((acc, r) => {
    acc[r.threadId] = r.folderId;
    return acc;
  }, {});
  const selected = threads.filter((t) => {
    if (t.archivedAt) return false;
    if (dbPlaces[t.id] && memberIds.has(dbPlaces[t.id]!)) return true;
    if (!t.environmentId || !envIds.has(t.environmentId)) return false;
    if (!pathShared) return true;
    return dbPlaces[t.id] === f.id;
  });
  const ids = new Set(selected.map((t) => t.id));
  if (
    threads.some(
      (t) => t.parentThreadId && ids.has(t.parentThreadId) && !ids.has(t.id),
    )
  )
    throw userError("sec_children_outside", { section: f.name });
  if (
    selected.some(
      (t) =>
        ["active", "starting", "stopping", "pending"].includes(t.status) ||
        t.queuedWork !== "none" ||
        Object.values(t.activity).some((n) => n > 0),
    )
  )
    throw userError("sec_running_chats", {
      section: f.name,
      chat: (selected.find(busyThread) ?? selected[0]).title || "",
    });

  for (const t of selected) await deps.sync(t.id);
  await deps.pending();
  const remaining = [...selected];
  while (remaining.length) {
    const leaf =
      remaining.find(
        (t) => !remaining.some((c) => c.parentThreadId === t.id),
      ) ?? remaining[0];
    const live = await bb.sdk.threads.get({ threadId: leaf.id });
    if (["active", "starting", "pending", "stopping"].includes(live.status))
      throw userError("sec_chat_started_running", { chat: live.title || leaf.id });
    await bb.sdk.threads.stop({ threadId: leaf.id });
    if (input.mode === "purge")
      await bb.sdk.threads.delete({
        threadId: leaf.id,
        childThreadsConfirmed: false,
      });
    else await bb.sdk.threads.archive({ threadId: leaf.id });
    remaining.splice(remaining.indexOf(leaf), 1);
  }

  if (input.mode === "purge") {
    const exists = await bb.sdk.hosts.pathsExist({
      hostId: f.hostId,
      paths: [f.path],
    });
    if (exists.existence[f.path])
      await bb.sdk.files.remove({
        hostId: f.hostId,
        path: f.path,
        recursive: true,
      });
  }

  for (const m of members) if (!isGroup(m)) deps.forgetGithub(m.hostId, m.path);
  deps.dropMembers(members);
  deps.changed();
  return { ok: true as const, mode: input.mode };
}
