import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Folder } from "./server";

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
    forgetRepo: (hostId: string, path: string) => void;
    changed: () => void;
    archive: (folderId: string) => Promise<unknown>;
  },
  input: { folderId: string; mode: SectionRemoveMode },
) {
  const f = deps.folders().find((x) => x.id === input.folderId);
  if (!f || isGroup(f))
    throw new Error(
      "A group has no folder. Move or archive its sections, then delete the group.",
    );
  if (deps.chatMoving()) throw new Error("Finish pending chat moves first.");
  if (deps.sectionMoving(f.id))
    throw new Error("Finish the unfinished section move first.");
  if (deps.pendingArchives(f.projectId))
    throw new Error("Finish pending section archives first.");
  if (input.mode === "archive") {
    deps.forgetRepo(f.hostId, f.path);
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
    throw new Error(
      "The section holds sections on another device or outside its folder. Move or remove them first.",
    );

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
    throw new Error(
      "This folder contains another BB project. Remove it from the tree instead of deleting the files.",
    );

  const pathShared = all.some(
    (c) =>
      c.id !== f.id &&
      !isGroup(c) &&
      c.hostId === f.hostId &&
      c.path === f.path,
  );
  if (input.mode === "purge" && pathShared)
    throw new Error(
      "Another section uses this folder. Remove it from the tree so the shared files stay.",
    );

  const root = await deps.root(f.projectId, f.hostId);
  const insideProject = within(f.path, root.path);
  if (input.mode === "purge" && !insideProject)
    throw new Error(
      "Complete delete is only for a folder inside the project. Remove an outside folder from the tree instead.",
    );

  const envs = await bb.sdk.environments.list();
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
    throw new Error("An environment from another BB project uses this folder.");
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
    throw new Error(
      "Section chats have child chats outside this folder. Finish or move them first.",
    );
  if (
    selected.some(
      (t) =>
        ["active", "starting", "stopping", "pending"].includes(t.status) ||
        t.queuedWork !== "none" ||
        Object.values(t.activity).some((n) => n > 0),
    )
  )
    throw new Error(
      "The section has running chats or queued messages. Finish them first.",
    );

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
      throw new Error(
        "The chat started running. Wait for it to finish and retry.",
      );
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

  for (const m of members) if (!isGroup(m)) deps.forgetRepo(m.hostId, m.path);
  deps.dropMembers(members);
  deps.changed();
  return { ok: true as const, mode: input.mode };
}
