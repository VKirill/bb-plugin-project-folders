import { listAll } from "./list-all";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Folder } from "./server";
const savedFolder = z.object({
  id: z.string(),
  projectId: z.string(),
  hostId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  path: z.string(),
  kind: z.enum(["folder", "group"]).optional(),
});
export const archiveSchema = z.object({
  id: z.string(),
  folder: savedFolder,
  members: z.array(savedFolder),
  rootPath: z.string(),
  archivePath: z.string(),
  createdAt: z.number(),
  state: z.enum(["archiving", "archived", "restoring"]),
  threadIds: z.array(z.string()),
  restoreThreadIds: z.array(z.string()),
  error: z.string().nullable(),
  /** The folder lives outside the project folder: its files stay in place. */
  external: z.boolean().optional(),
});
export type Archive = z.infer<typeof archiveSchema>;
/** Groups have no folder, so they join an archive through their place in the tree. */
function withNestedGroups(all: Folder[], members: Folder[]): Folder[] {
  const ids = new Set(members.map((m) => m.id));
  const out = [...members];
  for (let added = true; added;) {
    added = false;
    for (const g of all)
      if (
        g.kind === "group" &&
        !ids.has(g.id) &&
        g.parentId &&
        ids.has(g.parentId)
      ) {
        ids.add(g.id);
        out.push(g);
        added = true;
      }
  }
  return out;
}
export function makeArchives(
  bb: BbPluginApi,
  options: {
    folders: () => Folder[];
    canonical?: (hostId: string, path: string) => string;
    projectMoving?: (projectId: string) => boolean;
    root: (projectId: string, hostId: string) => Promise<Folder>;
    sync: (id: string) => Promise<unknown>;
    pending: () => Promise<unknown>;
    changed: () => void;
  },
) {
  const db = bb.storage.database();
  const list = () =>
    (
      db
        .prepare("SELECT data FROM folder_archives ORDER BY createdAt DESC")
        .all() as { data: string }[]
    ).map((r) => archiveSchema.parse(JSON.parse(r.data)));
  const put = (a: Archive) =>
    db
      .prepare("INSERT OR REPLACE INTO folder_archives VALUES (?,?,?)")
      .run(a.id, a.createdAt, JSON.stringify(a));
  const inside = (p: string, root: string) =>
    p === root || p.startsWith(root + path.sep);
  const matches = (projectId: string, hostId: string, name: string) =>
    list().filter(
      (a) =>
        a.state === "archived" &&
        a.folder.projectId === projectId &&
        a.folder.hostId === hostId &&
        [a.folder.name, path.basename(a.folder.path)].some(
          (n) =>
            n.normalize("NFC").toLocaleLowerCase() ===
            name.trim().normalize("NFC").toLocaleLowerCase(),
        ),
    );
  const blocked = (threadId: string) =>
    list().some((a) => a.threadIds.includes(threadId));
  const moving = (hostId: string, p: string) =>
    list().some(
      (a) =>
        a.state !== "archived" &&
        a.folder.hostId === hostId &&
        inside(options.canonical?.(hostId, p) ?? p, a.folder.path),
    );
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(run: () => Promise<T>): Promise<T> {
    const next = queue.then(run, run);
    queue = next.catch(() => {});
    return next;
  }
  async function threadInventory(projectId: string) {
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
  async function archive(folderId: string): Promise<Archive> {
    return serial(async () => {
      let a = list().find(
        (a) => a.folder.id === folderId && a.state === "archiving",
      );
      if (!a) {
        const f = options.folders().find((f) => f.id === folderId);
        if (!f) throw new Error("Section not found.");
        const root = await options.root(f.projectId, f.hostId);
        const otherProjects = await bb.sdk.projects.list();
        if (
          otherProjects.some(
            (p) =>
              p.id !== f.projectId &&
              p.sources.some(
                (source) =>
                  source.type === "local_path" &&
                  source.hostId === f.hostId &&
                  inside(source.path, f.path),
              ),
          )
        )
          throw new Error(
            "This folder contains another BB project. Move it separately before archiving the section.",
          );
        const envs = await listAll((p) => bb.sdk.environments.list(p));
        if (
          envs.some(
            (e) =>
              e.projectId !== f.projectId &&
              e.hostId === f.hostId &&
              e.path &&
              inside(options.canonical?.(e.hostId, e.path) ?? e.path, f.path) &&
              e.status === "ready",
          )
        )
          throw new Error(
            "An environment from another BB project uses this folder.",
          );
        const envIds = new Set(
          envs
            .filter(
              (e) =>
                e.hostId === f.hostId &&
                e.path &&
                inside(options.canonical?.(e.hostId, e.path) ?? e.path, f.path),
            )
            .map((e) => e.id),
        );
        const all = await threadInventory(f.projectId);
        const places = Object.fromEntries(
          (
            db
              .prepare("SELECT threadId, folderId FROM thread_places")
              .all() as { threadId: string; folderId: string | null }[]
          ).map((r) => [r.threadId, r.folderId]),
        );
        const pathShared = options
          .folders()
          .some(
            (c) =>
              c.id !== f.id &&
              c.kind !== "group" &&
              c.hostId === f.hostId &&
              c.path === f.path,
          );
        const selected = all.filter((t) => {
          if (!t.environmentId || !envIds.has(t.environmentId)) return false;
          if (!pathShared) return true;
          return places[t.id] === f.id;
        });
        const ids = new Set(selected.map((t) => t.id));
        if (
          all.some(
            (t) =>
              t.parentThreadId && ids.has(t.parentThreadId) && !ids.has(t.id),
          )
        )
          throw new Error(
            "Section chats have child chats outside this folder. Finish or move them first.",
          );
        if (
          selected.some(
            (t) =>
              ["active", "starting", "stopping", "pending"].includes(
                t.status,
              ) ||
              t.queuedWork !== "none" ||
              Object.values(t.activity).some((n) => n > 0),
          )
        )
          throw new Error(
            "The section has running chats or queued messages. Finish them before archiving.",
          );
        const members = withNestedGroups(
          options.folders(),
          options
            .folders()
            .filter(
              (c) =>
                c.kind !== "group" &&
                c.projectId === f.projectId &&
                c.hostId === f.hostId &&
                (c.id === f.id ||
                  (c.path !== f.path && inside(c.path, f.path))),
            ),
        );
        const memberIds = new Set(members.map((m) => m.id));
        if (
          options
            .folders()
            .some(
              (c) =>
                c.parentId && memberIds.has(c.parentId) && !memberIds.has(c.id),
            )
        )
          throw new Error(
            "The section holds sections on another device or outside its folder. Move or archive them first.",
          );
        // Save history before admitting the move; after journaling, event exports are suppressed.
        for (const t of selected) await options.sync(t.id);
        const id = randomUUID();
        const shared = options
          .folders()
          .some(
            (c) =>
              c.id !== f.id &&
              c.kind !== "group" &&
              c.hostId === f.hostId &&
              c.path === f.path,
          );
        const external = !inside(f.path, root.path) || shared;
        a = {
          id,
          folder: f,
          members,
          rootPath: root.path,
          archivePath: external
            ? f.path
            : path.join(root.path, ".bb/archive/sections", id, "folder"),
          external,
          createdAt: Date.now(),
          state: "archiving",
          threadIds: [...ids],
          restoreThreadIds: selected
            .filter((t) => t.archivedAt === null)
            .map((t) => t.id),
          error: null,
        };
        put(a);
      }
      try {
        await options.pending();
        const currentEnvs = await listAll((p) => bb.sdk.environments.list(p));
        const currentEnvIds = new Set(
          currentEnvs
            .filter(
              (e) =>
                e.hostId === a!.folder.hostId &&
                e.path &&
                inside(
                  options.canonical?.(e.hostId, e.path) ?? e.path,
                  a!.folder.path,
                ),
            )
            .map((e) => e.id),
        );
        const late = (await threadInventory(a.folder.projectId)).filter(
          (t) =>
            t.environmentId &&
            currentEnvIds.has(t.environmentId) &&
            !a!.threadIds.includes(t.id),
        );
        if (
          late.some(
            (t) =>
              ["active", "starting", "stopping", "pending"].includes(
                t.status,
              ) ||
              t.queuedWork !== "none" ||
              Object.values(t.activity).some((n) => n > 0),
          )
        )
          throw new Error(
            "A new chat started in the section. Wait for it to finish and retry archiving.",
          );
        if (late.length) {
          a.threadIds.push(...late.map((t) => t.id));
          a.restoreThreadIds.push(
            ...late.filter((t) => t.archivedAt === null).map((t) => t.id),
          );
          put(a);
        }

        for (const id of a.restoreThreadIds) {
          const t = await bb.sdk.threads.get({ threadId: id });
          if (["active", "starting", "pending", "stopping"].includes(t.status))
            throw new Error(
              "The chat started running. Wait for it to finish and retry archiving.",
            );
          await bb.sdk.threads.stop({ threadId: id });
          await bb.sdk.threads.archive({ threadId: id });
        }
        // A folder outside the project (a live website, say) stays in place:
        // only its chats and its tree record go to the archive.
        if (!a.external) {
          const exists = await bb.sdk.hosts.pathsExist({
            hostId: a.folder.hostId,
            paths: [a.folder.path, a.archivePath],
          });
          if (
            exists.existence[a.folder.path] &&
            exists.existence[a.archivePath]
          )
            throw new Error(
              "Both paths exist; the move stopped without overwriting files.",
            );
          if (exists.existence[a.folder.path]) {
            await bb.sdk.files.mkdir({
              hostId: a.folder.hostId,
              rootPath: a.rootPath,
              path: path.dirname(a.archivePath),
              recursive: true,
            });
            await bb.sdk.files.write({
              hostId: a.folder.hostId,
              rootPath: a.rootPath,
              path: path.join(path.dirname(a.archivePath), "manifest.json"),
              content: JSON.stringify(a, null, 2),
            });
            await bb.sdk.files.move({
              hostId: a.folder.hostId,
              rootPath: a.rootPath,
              sourcePath: a.folder.path,
              destinationPath: a.archivePath,
            });
          } else if (!exists.existence[a.archivePath])
            throw new Error(
              "Neither the original folder nor the archive was found.",
            );
        }
        db.transaction(() => {
          for (const f of a!.members) {
            db.prepare("DELETE FROM folder_paths WHERE folderId=?").run(f.id);
            db.prepare("DELETE FROM folders WHERE id=?").run(f.id);
          }
          a!.state = "archived";
          a!.error = null;
          put(a!);
        })();
        options.changed();
        return a;
      } catch (e) {
        a.error = String(e);
        put(a);
        options.changed();
        throw e;
      }
    });
  }
  async function restore(id: string): Promise<Folder> {
    return serial(async () => {
      const a = list().find((a) => a.id === id);
      if (!a) throw new Error("Archive not found.");
      if (options.projectMoving?.(a.folder.projectId))
        throw new Error("Finish the project move before restoring sections.");
      if (a.state === "archiving")
        throw new Error("Finish archiving first using Retry.");
      if (
        a.folder.parentId &&
        !options.folders().some((f) => f.id === a.folder.parentId)
      )
        throw new Error("Restore the parent section first.");
      try {
        const exists = await bb.sdk.hosts.pathsExist({
          hostId: a.folder.hostId,
          paths: [a.folder.path, a.archivePath],
        });
        if (a.external && !exists.existence[a.folder.path])
          throw new Error("The section folder was not found.");
        if (
          !a.external &&
          exists.existence[a.folder.path] &&
          (a.state !== "restoring" || exists.existence[a.archivePath])
        )
          throw new Error(
            "The original path is occupied. Move the current folder or use a different name for the new section.",
          );
        for (const f of a.members) {
          const active = options
            .folders()
            .find(
              (x) =>
                x.projectId === f.projectId &&
                x.hostId === f.hostId &&
                x.path === f.path,
            );
          if (active && active.id !== f.id)
            throw new Error("The section path is already used in the tree.");
        }
        a.state = "restoring";
        a.error = null;
        put(a);
        if (a.external) {
          // Nothing moved on archive, so nothing moves back.
        } else if (exists.existence[a.archivePath]) {
          await bb.sdk.files.mkdir({
            hostId: a.folder.hostId,
            rootPath: a.rootPath,
            path: path.dirname(a.folder.path),
            recursive: true,
          });
          await bb.sdk.files.move({
            hostId: a.folder.hostId,
            rootPath: a.rootPath,
            sourcePath: a.archivePath,
            destinationPath: a.folder.path,
          });
        } else if (!exists.existence[a.folder.path])
          throw new Error("Archive folder not found.");
        db.transaction(() => {
          for (const f of a.members)
            db.prepare(
              "INSERT OR IGNORE INTO folders (id,projectId,hostId,parentId,name,path,sort,kind) VALUES (@id,@projectId,@hostId,@parentId,@name,@path,@sort,@kind)",
            ).run({
              ...f,
              sort: (f as { sort?: number }).sort ?? 0,
              kind: f.kind ?? "folder",
            });
          for (const f of a.members)
            if ((f.kind ?? "folder") === "folder")
              db.prepare(
                "INSERT OR IGNORE INTO folder_paths (folderId, hostId, path) VALUES (?, ?, ?)",
              ).run(f.id, f.hostId, f.path);
        })();
        for (const threadId of a.restoreThreadIds)
          await bb.sdk.threads.unarchive({ threadId });
        db.prepare("DELETE FROM folder_archives WHERE id=?").run(id);
        options.changed();
        return a.folder;
      } catch (e) {
        a.error = String(e);
        put(a);
        options.changed();
        throw e;
      }
    });
  }
  return { list, matches, blocked, moving, archive, restore };
}
