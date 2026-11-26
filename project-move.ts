import { listAll } from "./list-all";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { moveHostContract } from "./move-contract";
import { archiveSchema } from "./archive";
type Move = {
  id: string;
  projectId: string;
  hostId: string;
  sourceId: string;
  source: string;
  destination: string;
  complete: boolean;
  error: string | null;
};
const within = (p: string, r: string) =>
  p === r || p.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
export function makeProjectMoves(
  bb: BbPluginApi,
  changed: () => void,
  pending: () => Promise<unknown>,
) {
  const db = bb.storage.database();
  const list = () =>
    (
      db.prepare("SELECT data FROM project_moves").all() as { data: string }[]
    ).map((x) => JSON.parse(x.data) as Move);
  const put = (m: Move) =>
    db
      .prepare("INSERT OR REPLACE INTO project_moves VALUES (?,?)")
      .run(m.id, JSON.stringify(m));
  const busy = (projectId: string) =>
    list().some((m) => m.projectId === projectId && !m.complete);
  const canonical = (hostId: string, p: string) => {
    let result = p;
    for (let i = 0; i < 100; i++) {
      const m = list().find(
        (m) => m.complete && m.hostId === hostId && within(result, m.source),
      );
      if (!m) return result;
      result = m.destination + result.slice(m.source.length);
    }
    throw new Error("Too many project relocation links.");
  };
  const recordCompleted = (input: {
    projectId: string;
    hostId: string;
    sourceId: string;
    source: string;
    destination: string;
    keepId?: string;
  }) => {
    if (input.source === input.destination) return;
    const remapDest = (q: string) =>
      within(q, input.source)
        ? input.destination + q.slice(input.source.length)
        : q;
    for (const prev of list()) {
      if (prev.id === input.keepId || !prev.complete || prev.hostId !== input.hostId)
        continue;
      const nextDest = remapDest(prev.destination);
      if (
        nextDest === prev.source ||
        within(nextDest, prev.source) ||
        within(prev.source, nextDest) ||
        prev.source === input.destination
      ) {
        db.prepare("DELETE FROM project_moves WHERE id=?").run(prev.id);
      } else if (nextDest !== prev.destination) {
        put({ ...prev, destination: nextDest });
      }
    }
    if (
      within(input.source, input.destination) ||
      within(input.destination, input.source)
    )
      return;
    put({
      id: input.keepId ?? randomUUID(),
      projectId: input.projectId,
      hostId: input.hostId,
      sourceId: input.sourceId,
      source: input.source,
      destination: input.destination,
      complete: true,
      error: null,
    });
  };
  const host = bb.hosts.experimental_client({ contract: moveHostContract });
  let running = false;
  async function move(input: {
    projectId: string;
    hostId: string;
    destination: string;
  }) {
    if (running) throw new Error("Another project move is running.");
    running = true;
    let m: Move | undefined;
    try {
      const projects = await bb.sdk.projects.list();
      const project = projects.find((p) => p.id === input.projectId);
      const source = project?.sources.find(
        (s) => s.type === "local_path" && s.hostId === input.hostId,
      );
      if (!project || !source) throw new Error("Project source not found.");
      m = list().find((m) => m.projectId === input.projectId && !m.complete);
      if (
        m &&
        (m.destination !== input.destination || m.hostId !== input.hostId)
      )
        throw new Error(
          "Retry the unfinished move to its original destination first.",
        );
      if (!m)
        m = {
          id: randomUUID(),
          projectId: project!.id,
          hostId: input.hostId,
          sourceId: source.id,
          source: source.path,
          destination: path.resolve(input.destination),
          complete: false,
          error: null,
        };
      if (
        projects.some(
          (p) =>
            p.id !== project.id &&
            p.sources.some(
              (s) =>
                s.type === "local_path" &&
                s.hostId === m!.hostId &&
                (within(canonical(s.hostId, s.path), m!.source) ||
                  within(m!.destination, canonical(s.hostId, s.path))),
            ),
        )
      )
        throw new Error(
          "Another BB project uses the source or destination tree. Move it separately.",
        );
      const envs = await listAll((p) => bb.sdk.environments.list(p));
      if (
        envs.some(
          (e) =>
            e.hostId === m!.hostId &&
            e.path &&
            e.projectId !== project.id &&
            within(canonical(e.hostId, e.path), m!.source),
        )
      )
        throw new Error(
          "Another project has an environment inside this folder.",
        );
      if (
        envs.some(
          (e) =>
            e.projectId === project.id &&
            e.hostId === m!.hostId &&
            e.path &&
            !within(canonical(e.hostId, e.path), m!.source),
        )
      )
        throw new Error(
          "This project has environments outside its folder. Relocate those separately before moving the project.",
        );
      const archived = (
        db.prepare("SELECT data FROM folder_archives").all() as {
          data: string;
        }[]
      ).map((x) => archiveSchema.parse(JSON.parse(x.data)));
      if (
        archived.some(
          (a) => a.folder.projectId === project.id && a.state !== "archived",
        )
      )
        throw new Error(
          "Finish pending archive operations before moving this project.",
        );
      await host.call(
        "inspect",
        { source: m.source, destination: m.destination },
        { hostId: m.hostId },
      );
      async function checkThreads(stop: boolean) {
        for (const archived of [false, true])
          for (let offset = 0; ; offset += 200) {
            const threads = await bb.sdk.threads.list({
              projectId: project!.id,
              archived,
              includeHidden: true,
              limit: 200,
              offset,
            });
            for (const t of threads) {
              if (
                ["active", "starting", "stopping", "pending"].includes(
                  t.status,
                ) ||
                t.queuedWork !== "none" ||
                Object.values(t.activity).some((n) => n > 0)
              )
                throw new Error(
                  "Finish all running chats and queued work before moving the project.",
                );
              if (stop) await bb.sdk.threads.stop({ threadId: t.id });
            }
            if (threads.length < 200) break;
          }
      }
      await checkThreads(false);
      // Persist the barrier, drain exports, then recheck for work admitted during preflight.
      put(m);
      changed();
      await pending();
      await checkThreads(true);
      await host.call(
        "move",
        { source: m.source, destination: m.destination },
        { hostId: m.hostId },
      );
      await bb.sdk.projects.sources.update({
        projectId: m.projectId,
        sourceId: m.sourceId,
        type: "local_path",
        path: m.destination,
      });
      const remap = (p: string) =>
        within(p, m!.source) ? m!.destination + p.slice(m!.source.length) : p;
      // Rebase archive manifests too; canonical BB transcripts retain their historical text.
      const newArchives = archived
        .filter(
          (a) =>
            a.folder.projectId === m!.projectId &&
            a.folder.hostId === m!.hostId,
        )
        .map((a) => ({
          ...a,
          rootPath: remap(a.rootPath),
          archivePath: remap(a.archivePath),
          folder: { ...a.folder, path: remap(a.folder.path) },
          members: a.members.map((f) => ({ ...f, path: remap(f.path) })),
        }));
      for (const a of newArchives)
        await bb.sdk.files.write({
          hostId: m.hostId,
          path: path.join(path.dirname(a.archivePath), "manifest.json"),
          content: JSON.stringify(a, null, 2),
          rootPath: m.destination,
        });
      db.transaction(() => {
        const fs = db
          .prepare("SELECT id,path FROM folders WHERE projectId=? AND hostId=?")
          .all(m!.projectId, m!.hostId) as { id: string; path: string }[];
        for (const f of fs)
          db.prepare("UPDATE folders SET path=? WHERE id=?").run(
            remap(f.path),
            f.id,
          );
        for (const a of newArchives)
          db.prepare("UPDATE folder_archives SET data=? WHERE id=?").run(
            JSON.stringify(a),
            a.id,
          );
        for (const e of db
          .prepare("SELECT threadId,path FROM exports")
          .all() as { threadId: string; path: string | null }[])
          if (e.path && within(e.path, m!.source))
            db.prepare("UPDATE exports SET path=? WHERE threadId=?").run(
              remap(e.path),
              e.threadId,
            );
        for (const row of db
          .prepare("SELECT folderId, data FROM section_moves")
          .all() as { folderId: string; data: string }[]) {
          const s = JSON.parse(row.data) as {
            hostId: string;
            source: string;
            destination: string;
          };
          if (
            s.hostId === m!.hostId &&
            (within(s.source, m!.source) || within(s.destination, m!.source))
          ) {
            const nextSource = remap(s.source);
            const nextDest = remap(s.destination);
            if (
              nextSource === nextDest ||
              within(nextSource, nextDest) ||
              within(nextDest, nextSource)
            )
              db.prepare("DELETE FROM section_moves WHERE folderId=?").run(
                row.folderId,
              );
            else
              db.prepare("UPDATE section_moves SET data=? WHERE folderId=?").run(
                JSON.stringify({
                  ...s,
                  source: nextSource,
                  destination: nextDest,
                }),
                row.folderId,
              );
          }
        }
        m!.complete = true;
        m!.error = null;
        recordCompleted({
          projectId: m!.projectId,
          hostId: m!.hostId,
          sourceId: m!.sourceId,
          source: m!.source,
          destination: m!.destination,
          keepId: m!.id,
        });
      })();
      changed();
      return m;
    } catch (e) {
      if (m && list().some((x) => x.id === m!.id)) {
        m.error = e instanceof Error ? e.message : String(e);
        put(m);
        changed();
      }
      throw e;
    } finally {
      running = false;
    }
  }
  return { list, busy, canonical, recordCompleted, move };
}
