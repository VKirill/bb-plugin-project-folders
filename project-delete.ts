import path from "node:path";
import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Folder } from "./server";
import { busyThread } from "./archive";
import { userError } from "./user-error";

const within = (p: string, r: string) =>
  p === r || p.startsWith(r.endsWith(path.sep) ? r : r + path.sep);

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

export async function deleteProject(
  bb: BbPluginApi,
  deps: {
    folders: () => Folder[];
    busy: (projectId: string) => boolean;
    pendingArchives: (projectId: string) => boolean;
    dropProjectRows: (projectId: string) => void;
    changed: () => void;
  },
  input: { projectId: string; files: "keep" | "archive" },
) {
  // One cheap lookup, only on the failure paths, so the message can name the project.
  const projectName = async () =>
    (await bb.sdk.projects.list()).find((p) => p.id === input.projectId)
      ?.name ?? "";
  if (deps.busy(input.projectId))
    throw userError("sec_project_moving_delete", {
      project: await projectName(),
    });
  if (deps.pendingArchives(input.projectId))
    throw userError("sec_archives_pending_project", {
      project: await projectName(),
    });
  const project = (await bb.sdk.projects.list()).find(
    (p) => p.id === input.projectId,
  );
  if (!project) throw userError("sec_project_not_found");
  if (project.kind === "personal")
    throw userError("sec_inbox_undeletable", { project: project.name });
  const threads = await threadInventory(bb, project.id);
  if (
    threads.some(
      (t) =>
        ["active", "starting", "stopping", "pending"].includes(t.status) ||
        t.queuedWork !== "none" ||
        Object.values(t.activity).some((n) => n > 0),
    )
  )
    throw userError("sec_project_running_chats", {
      project: project.name,
      chat: (threads.find(busyThread) ?? threads[0]).title || "",
    });
  const sources = project.sources.filter((s) => s.type === "local_path");
  let archivePath: string | null = null;
  if (input.files === "archive") {
    if (sources.length < 1)
      throw userError("sec_project_archive_needs_folder", { project: project.name });
    const others = await bb.sdk.projects.list();
    for (const source of sources) {
      if (
        others.some(
          (p) =>
            p.id !== project.id &&
            p.sources.some(
              (s) =>
                s.type === "local_path" &&
                s.hostId === source.hostId &&
                within(s.path, source.path),
            ),
        )
      )
        throw userError("sec_project_contains_project", { project: project.name, path: source.path });
      if (
        deps
          .folders()
          .some(
            (f) =>
              f.projectId !== project.id &&
              f.hostId === source.hostId &&
              f.path === source.path,
          )
      )
        throw userError("sec_project_folder_is_section", { project: project.name, path: source.path });
    }
    const archiveId = randomUUID();
    for (const source of sources) {
      const dest = path.join(
        path.dirname(source.path),
        ".bb/archive/projects",
        archiveId,
        "folder",
      );
      await bb.sdk.files.mkdir({
        hostId: source.hostId,
        path: path.dirname(dest),
        recursive: true,
      });
      await bb.sdk.files.move({
        hostId: source.hostId,
        sourcePath: source.path,
        destinationPath: dest,
      });
      archivePath ??= dest;
    }
  }
  deps.dropProjectRows(project.id);
  await bb.sdk.projects.delete({ projectId: project.id });
  deps.changed();
  return { ok: true as const, files: input.files, archivePath };
}
