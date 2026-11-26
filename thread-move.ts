import path from "node:path";
import { z } from "zod";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Folder } from "./server";
import { userError } from "./user-error";
const jobSchema = z.object({
  threadId: z.string(),
  projectId: z.string(),
  hostId: z.string(),
  from: z.string(),
  to: z.string(),
  source: z.string(),
  destination: z.string(),
  /** Epoch ms the chat was asked to switch its own directory. */
  asked: z.number().optional(),
});
/**
 * BB has no plugin API for moving an existing chat's working directory
 * (get-bb/bb#3904), but every chat's own agent has the `update_environment_
 * directory` tool. So when core refuses, the move asks the chat to finish it:
 * one agent-only message, carrying this marker so the dispatch guard lets it
 * past the very barrier it is meant to lift.
 */
export const RELOCATE_MARKER = "[project-folders:relocate]";
export const relocationRequest = (to: string) =>
  `${RELOCATE_MARKER} Projects & Sections moved this chat to the section at ${to}. Call the update_environment_directory tool with exactly that path so your working directory follows, then reply with one short line naming the new directory. If that tool is not available to you, reply with exactly "No update_environment_directory tool" and nothing else — do not claim the directory changed. Do no other work in this turn.`;
export function makeThreadMoves(
  bb: BbPluginApi,
  options: {
    target: (input: {
      projectId: string;
      folderId: string | null;
      hostId?: string;
    }) => Promise<Folder>;
    allowed: (threadId: string, folder: Folder) => void;
    pendingExports: () => Promise<unknown>;
    canonical: (hostId: string, path: string) => string;
    changed: () => void;
    /** The move landed: the chat is listed by its new folder, not by hand. */
    settled?: (threadId: string) => void;
    /**
     * List the chat under the destination while its folder has not followed
     * yet. Not every provider has the directory tool, so the tree must show
     * the move the user made even when the workspace cannot.
     */
    file?: (threadId: string, folderId: string | null) => void;
  },
) {
  const db = bb.storage.database();
  /**
   * A barrier stops a chat only while its files are in flight. A chat that was
   * merely asked to switch directory has moved nothing yet, so it keeps
   * working normally — an agent that ignores the request must not lock its
   * own chat out.
   */
  const blocked = (id: string) => {
    const row = db
      .prepare("SELECT data FROM thread_moves WHERE threadId=?")
      .get(id) as { data: string } | undefined;
    if (!row) return false;
    const parsed = jobSchema.safeParse(JSON.parse(row.data));
    return !parsed.success || !parsed.data.asked;
  };
  const any = () =>
    !!db.prepare("SELECT threadId FROM thread_moves LIMIT 1").get();
  const running = new Set<string>();
  async function move(input: {
    threadId: string;
    projectId: string;
    folderId: string | null;
    hostId?: string;
  }) {
    if (running.has(input.threadId))
      throw userError("sec_chat_already_moving", { chat: input.threadId });
    running.add(input.threadId);
    try {
      const thread = await bb.sdk.threads.get({ threadId: input.threadId });
      if (thread.projectId !== input.projectId || !thread.environmentId)
        throw userError("sec_chat_wrong_project", { chat: thread.title || thread.id });
      if (thread.archivedAt || !["idle", "error"].includes(thread.status))
        throw userError("sec_chat_busy", { chat: thread.title || thread.id });
      const environment = await bb.sdk.environments.get({
        environmentId: thread.environmentId,
      });
      const folder = await options.target(input);
      if (!environment.path || environment.hostId !== folder.hostId)
        throw userError("sec_chat_other_device", {
          chat: thread.title || thread.id,
          section: folder.name,
        });
      options.allowed(thread.id, folder);
      const saved = db
        .prepare("SELECT data FROM thread_moves WHERE threadId=?")
        .get(thread.id) as { data: string } | undefined;
      const from = options.canonical(environment.hostId, environment.path);
      const job = saved
        ? jobSchema.parse(JSON.parse(saved.data))
        : {
            threadId: thread.id,
            projectId: thread.projectId,
            hostId: folder.hostId,
            from,
            to: folder.path,
            source: path.join(from, ".bb/chats", thread.id),
            destination: path.join(folder.path, ".bb/chats", thread.id),
          };
      if (job.to !== folder.path)
        throw userError("sec_chat_prev_move", {
          chat: thread.title || thread.id,
          path: job.to,
        });
      if (job.from === job.to) return { path: job.to };
      let existence = (
        await bb.sdk.hosts.pathsExist({
          hostId: job.hostId,
          paths: [job.source, job.destination],
        })
      ).existence;
      if (existence[job.source] && existence[job.destination])
        throw userError("sec_chat_storage_both", {
          chat: thread.title || thread.id,
          source: job.source,
          destination: job.destination,
        });
      db.prepare("INSERT OR REPLACE INTO thread_moves VALUES (?,?)").run(
        thread.id,
        JSON.stringify(job),
      );
      await options.pendingExports();
      existence = (
        await bb.sdk.hosts.pathsExist({
          hostId: job.hostId,
          paths: [job.source, job.destination],
        })
      ).existence;
      if (existence[job.source] && existence[job.destination]) {
        if (!saved)
          db.prepare("DELETE FROM thread_moves WHERE threadId=?").run(
            thread.id,
          );
        throw userError("sec_chat_storage_both", {
          chat: thread.title || thread.id,
          source: job.source,
          destination: job.destination,
        });
      }
      if (from !== job.to) {
        const request = {
          threadId: thread.id,
          expectedEnvironmentId: thread.environmentId,
          path: job.to,
        };
        const switched = await switchDirectory(thread.id, request);
        if (!switched) {
          // Core refused the switch, so the chat performs it itself. The job
          // stays on the barrier until its environment really is the new
          // folder; `finish` moves the files then.
          db.prepare("INSERT OR REPLACE INTO thread_moves VALUES (?,?)").run(
            thread.id,
            JSON.stringify({ ...job, asked: Date.now() }),
          );
          options.file?.(thread.id, input.folderId ?? null);
          await bb.sdk.threads.send({
            threadId: thread.id,
            // The chat is idle by now; "start" keeps this a turn of its own.
            mode: "start",
            input: [
              {
                type: "text",
                text: relocationRequest(job.to),
                mentions: [],
                visibility: "agent-only",
              },
            ],
          });
          options.changed();
          return { path: job.to, asked: true };
        }
      }
      if (existence[job.source]) {
        await bb.sdk.files.mkdir({
          hostId: job.hostId,
          path: path.dirname(job.destination),
          recursive: true,
        });
        await bb.sdk.files.move({
          hostId: job.hostId,
          sourcePath: job.source,
          destinationPath: job.destination,
        });
      }
      db.prepare("DELETE FROM thread_moves WHERE threadId=?").run(thread.id);
      options.changed();
      return { path: job.to, asked: false };
    } finally {
      running.delete(input.threadId);
    }
  }
  /**
   * Asks core to repoint the chat. Returns false when this BB has no such API
   * — the documented case (get-bb/bb#3904), not an error to surface.
   */
  async function switchDirectory(
    threadId: string,
    request: { expectedEnvironmentId: string; path: string },
  ) {
    try {
      const updated = await bb.sdk.threads.update({
        threadId,
        experimental_directory: {
          path: request.path,
          expectedEnvironmentId: request.expectedEnvironmentId,
        },
      } as Parameters<typeof bb.sdk.threads.update>[0]);
      const next = updated.environmentId
        ? await bb.sdk.environments.get({
            environmentId: updated.environmentId,
          })
        : null;
      return next?.path === request.path;
    } catch {
      return false;
    }
  }
  /**
   * Completes a move the chat was asked to finish: once its environment is the
   * destination, the chat's own storage follows and the barrier lifts. Called
   * whenever a chat goes idle, so it costs nothing while nothing is pending.
   */
  /**
   * Settles a move the chat was asked to finish, once its turn is over:
   * "moved" when the chat really switched — its storage follows and the
   * hand-filing is dropped; "kept" when it did not, which is the honest end
   * for a provider whose agent has no directory tool. Either way the chat
   * ends up listed where the user dropped it.
   */
  async function finish(threadId: string): Promise<"moved" | "kept" | false> {
    const saved = db
      .prepare("SELECT data FROM thread_moves WHERE threadId=?")
      .get(threadId) as { data: string } | undefined;
    if (!saved) return false;
    const job = jobSchema.parse(JSON.parse(saved.data));
    if (!job.asked) return false;
    const thread = await bb.sdk.threads.get({ threadId });
    if (!thread.environmentId) return false;
    // Wait for the turn the request started; only then is its answer final.
    if (thread.status !== "idle" || (thread.updatedAt ?? 0) <= job.asked)
      return false;
    const environment = await bb.sdk.environments.get({
      environmentId: thread.environmentId,
    });
    if (environment.path !== job.to || environment.hostId !== job.hostId) {
      db.prepare("DELETE FROM thread_moves WHERE threadId=?").run(threadId);
      options.changed();
      return "kept";
    }
    // Exports in flight write into the old storage folder: let them land.
    await options.pendingExports();
    const { existence } = await bb.sdk.hosts.pathsExist({
      hostId: job.hostId,
      paths: [job.source, job.destination],
    });
    if (existence[job.source] && !existence[job.destination]) {
      await bb.sdk.files.mkdir({
        hostId: job.hostId,
        path: path.dirname(job.destination),
        recursive: true,
      });
      await bb.sdk.files.move({
        hostId: job.hostId,
        sourcePath: job.source,
        destinationPath: job.destination,
      });
    }
    db.prepare("DELETE FROM thread_moves WHERE threadId=?").run(threadId);
    options.settled?.(threadId);
    options.changed();
    return "moved";
  }
  return { move, blocked, any, finish };
}
