import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Folder } from "./server";
import { moveHostContract } from "./move-contract";
import { within } from "./move-files";

type SectionMove = {
  folderId: string;
  projectId: string;
  hostId: string;
  source: string;
  destination: string;
  complete: boolean;
  error: string | null;
};

type ArchiveManifest = {
  rootPath: string;
  archivePath: string;
  folder: { projectId: string; hostId: string; path: string };
  members: { path: string }[];
  state?: string;
};

/** Move a section to a new path on the same device, or re-point a section
 * whose directory was renamed outside BB: the old path becomes a
 * compatibility symlink so existing chat environments keep working. */
export function makeSectionMoves(
  bb: BbPluginApi,
  deps: {
    folders: () => Folder[];
    changed: () => void;
    pendingExports: () => Promise<unknown>;
    pendingArchives: (projectId: string) => boolean;
    busyProjectMoves: (projectId: string) => boolean;
    canonical: (hostId: string, p: string) => string;
    /** A section outside its tree parent may also move outside the project folder. */
    detached?: (folder: Folder) => Promise<boolean>;
  },
) {
  const db = bb.storage.database();
  const host = bb.hosts.experimental_client({ contract: moveHostContract });
  const list = () =>
    (
      db.prepare("SELECT data FROM section_moves").all() as { data: string }[]
    ).map((x) => JSON.parse(x.data) as SectionMove);
  const put = (m: SectionMove) =>
    db
      .prepare("INSERT OR REPLACE INTO section_moves VALUES (?,?)")
      .run(m.folderId, JSON.stringify(m));
  const busyProject = (projectId: string) =>
    list().some((m) => m.projectId === projectId && !m.complete);
  let running = false;
  async function move(input: { folderId: string; destination: string }) {
    if (running) throw new Error("Another section move is running.");
    running = true;
    let m: SectionMove | undefined;
    try {
      // Every row in the folders table is a real section; project roots are
      // synthetic records over BB project sources and move via project_move.
      const folder = deps.folders().find((f) => f.id === input.folderId);
      if (!folder) throw new Error("Section not found.");
      if (deps.busyProjectMoves(folder.projectId))
        throw new Error(
          "Project relocation is pending. Finish or retry it before changing the project.",
        );
      if (deps.pendingArchives(folder.projectId))
        throw new Error(
          "Finish pending archive operations before moving this section.",
        );
      const destination = path.resolve(input.destination);
      const saved = list().find(
        (x) => x.folderId === folder.id && !x.complete,
      );
      if (
        saved &&
        (saved.destination !== destination || saved.hostId !== folder.hostId)
      )
        throw new Error(
          "Retry the unfinished move to its original destination first.",
        );
      m = saved ?? {
        folderId: folder.id,
        projectId: folder.projectId,
        hostId: folder.hostId,
        source: folder.path,
        destination,
        complete: false,
        error: null,
      };
      if (folder.path === destination) {
        // The section already points here: a failed move whose path was fixed
        // elsewhere must not keep the whole project blocked.
        if (saved) {
          m.complete = true;
          m.error = null;
          put(m);
          deps.changed();
        }
        return { destination, complete: true };
      }
      if (within(folder.path, destination) || within(destination, folder.path))
        throw new Error(
          "The new path must not be inside the section or contain it.",
        );
      const all = deps.folders();
      const ancestors = new Set<string>();
      for (
        let cur = all.find((x) => x.id === folder.parentId);
        cur;
        cur = all.find((x) => x.id === cur!.parentId)
      )
        ancestors.add(cur.id);
      const movingIds = new Set<string>([folder.id]);
      for (const f of all)
        if (
          f.id !== folder.id &&
          f.projectId === folder.projectId &&
          f.hostId === folder.hostId &&
          f.path !== folder.path &&
          within(f.path, folder.path)
        )
          movingIds.add(f.id);
      const destTaken = all.some(
        (f) =>
          f.id !== folder.id &&
          f.kind !== "group" &&
          f.hostId === folder.hostId &&
          f.path === destination,
      );
      const sourceShared = all.some(
        (f) =>
          f.id !== folder.id &&
          f.kind !== "group" &&
          f.hostId === folder.hostId &&
          f.path === folder.path,
      );
      for (const f of all) {
        if (f.hostId !== folder.hostId || movingIds.has(f.id) || destTaken)
          continue;
        if (f.path === destination) continue;
        if (within(destination, f.path) && !ancestors.has(f.id))
          throw new Error("Choose a path that is not inside another section.");
        if (within(f.path, destination))
          throw new Error(
            "Another section is inside the new path. Move it separately.",
          );
      }
      const projects = await bb.sdk.projects.list();
      const free = (await deps.detached?.(folder)) ?? false;
      for (const p of projects)
        for (const s of p.sources) {
          if (s.type !== "local_path" || s.hostId !== folder.hostId) continue;
          if (p.id === folder.projectId) {
            if (destination === s.path) continue;
            if (
              (!free && !within(destination, s.path)) ||
              (within(s.path, destination) && destination !== s.path)
            )
              throw new Error(
                "Keep the section inside its project folder on this device.",
              );
          } else if (
            within(destination, s.path) ||
            within(s.path, destination)
          )
            throw new Error(
              "Another BB project uses this path. Move the section within its own project folder.",
            );
        }
      const canonical = (p: string) => deps.canonical(folder.hostId, p);
      const envs = await bb.sdk.environments.list();
      if (
        envs.some(
          (e) =>
            e.hostId === folder.hostId &&
            e.path &&
            e.projectId !== folder.projectId &&
            (within(canonical(e.path), folder.path) ||
              within(canonical(e.path), destination)),
        )
      )
        throw new Error("Another project has an environment inside this folder.");
      const relevantEnvs = new Set(
        envs
          .filter(
            (e) =>
              e.projectId === folder.projectId &&
              e.hostId === folder.hostId &&
              e.path &&
              (within(canonical(e.path), folder.path) ||
                within(canonical(e.path), destination)),
          )
          .map((e) => e.id),
      );
      const checkThreads = async (stop: boolean) => {
        const current = await bb.sdk.environments.list();
        const relevant = new Set(
          current
            .filter(
              (e) =>
                relevantEnvs.has(e.id) ||
                (e.projectId === folder.projectId &&
                  e.hostId === folder.hostId &&
                  e.path &&
                  (within(canonical(e.path), folder.path) ||
                    within(canonical(e.path), destination))),
            )
            .map((e) => e.id),
        );
        for (const archived of [false, true])
          for (let offset = 0; ; offset += 200) {
            const threads = await bb.sdk.threads.list({
              projectId: folder.projectId,
              archived,
              includeHidden: true,
              limit: 200,
              offset,
            });
            for (const t of threads) {
              if (!t.environmentId || !relevant.has(t.environmentId)) continue;
              if (
                ["active", "starting", "stopping", "pending"].includes(
                  t.status,
                ) ||
                t.queuedWork !== "none" ||
                Object.values(t.activity).some((n) => n > 0)
              )
                throw new Error(
                  "Finish the running chats in this section before changing its path.",
                );
              if (stop) await bb.sdk.threads.stop({ threadId: t.id });
            }
            if (threads.length < 200) break;
          }
      };
      if (sourceShared || destTaken) {
        db.transaction(() => {
          db.prepare("UPDATE folders SET path=? WHERE id=?").run(
            destination,
            folder.id,
          );
          db.prepare(
            "INSERT INTO folder_paths (folderId, hostId, path) VALUES (?, ?, ?) ON CONFLICT(folderId, hostId) DO UPDATE SET path=excluded.path",
          ).run(folder.id, folder.hostId, destination);
          m!.complete = true;
          m!.error = null;
          put(m!);
        })();
        deps.changed();
        return { destination, complete: true };
      }
      const existence = (
        await bb.sdk.hosts.pathsExist({
          hostId: folder.hostId,
          paths: [folder.path, destination],
        })
      ).existence;
      const srcExists = existence[folder.path];
      const dstExists = existence[destination];
      if (!srcExists && !dstExists)
        throw new Error(
          "Neither the section folder nor the new path was found on the device.",
        );
      if (srcExists && dstExists) {
        // Tolerated only when the source is the compatibility link of an
        // already finished move; anything else would merge two folders.
        const probe = await host.call(
          "inspect",
          { source: folder.path, destination },
          { hostId: folder.hostId },
        );
        if (!probe.moved)
          throw new Error(
            "Both paths exist; folders are never merged or overwritten.",
          );
      }
      await checkThreads(false);
      // Persist the barrier, drain exports, then recheck for work admitted during preflight.
      put(m);
      deps.changed();
      await deps.pendingExports();
      await checkThreads(true);
      if (srcExists && dstExists) {
        // Resume: the source is the compatibility link of an already moved folder.
      } else if (srcExists) {
        await host.call(
          "inspect",
          { source: folder.path, destination },
          { hostId: folder.hostId },
        );
        await host.call(
          "move",
          { source: folder.path, destination },
          { hostId: folder.hostId },
        );
      } else {
        await host.call(
          "link",
          { source: folder.path, destination },
          { hostId: folder.hostId },
        );
      }
      const remap = (p: string) =>
        within(p, folder.path) ? destination + p.slice(folder.path.length) : p;
      db.transaction(() => {
        for (const f of all)
          if (movingIds.has(f.id))
            db.prepare("UPDATE folders SET path=? WHERE id=?").run(
              remap(f.path),
              f.id,
            );
        for (const row of db
          .prepare("SELECT folderId, hostId, path FROM folder_paths")
          .all() as { folderId: string; hostId: string; path: string }[])
          if (row.hostId === folder.hostId && movingIds.has(row.folderId))
            db.prepare(
              "UPDATE folder_paths SET path=? WHERE folderId=? AND hostId=?",
            ).run(remap(row.path), row.folderId, row.hostId);
        for (const e of db
          .prepare("SELECT threadId,path FROM exports")
          .all() as { threadId: string; path: string | null }[])
          if (e.path && within(e.path, folder.path))
            db.prepare("UPDATE exports SET path=? WHERE threadId=?").run(
              remap(e.path),
              e.threadId,
            );
        for (const row of db
          .prepare("SELECT id,data FROM folder_archives")
          .all() as { id: string; data: string }[]) {
          const a = JSON.parse(row.data) as ArchiveManifest;
          if (
            a.folder?.projectId === folder.projectId &&
            a.folder?.hostId === folder.hostId &&
            within(a.folder.path, folder.path)
          )
            db.prepare("UPDATE folder_archives SET data=? WHERE id=?").run(
              JSON.stringify({
                ...a,
                rootPath: remap(a.rootPath),
                archivePath: remap(a.archivePath),
                folder: { ...a.folder, path: remap(a.folder.path) },
                members: a.members.map((f) => ({
                  ...f,
                  path: remap(f.path),
                })),
              }),
              row.id,
            );
        }
        m!.complete = true;
        m!.error = null;
        put(m!);
      })();
      deps.changed();
      return { destination, complete: true };
    } catch (e) {
      if (m && list().some((x) => x.folderId === m!.folderId)) {
        m.error = e instanceof Error ? e.message : String(e);
        put(m);
        deps.changed();
      }
      throw e;
    } finally {
      running = false;
    }
  }
  return { list, busyProject, move };
}
