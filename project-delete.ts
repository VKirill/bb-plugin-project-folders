import path from "node:path";
import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { Folder } from "./server";

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
  if (deps.busy(input.projectId))
    throw new Error(
      "Project relocation is pending. Finish or retry it before deleting the project.",
    );
  if (deps.pendingArchives(input.projectId))
    throw new Error("Finish pending section archives before deleting the project.");
  const project = (await bb.sdk.projects.list()).find(
    (p) => p.id === input.projectId,
  );
  if (!project) throw new Error("Project not found.");
  if (project.kind === "personal")
    throw new Error("The personal inbox cannot be deleted from this plugin.");
  const threads = await threadInventory(bb, project.id);
  if (
    threads.some(
      (t) =>
        ["active", "starting", "stopping", "pending"].includes(t.status) ||
        t.queuedWork !== "none" ||
        Object.values(t.activity).some((n) => n > 0),
    )
  )
    throw new Error(
      "Finish running chats and queued messages before deleting the project.",
    );
  const sources = project.sources.filter((s) => s.type === "local_path");
  let archivePath: string | null = null;
  if (input.files === "archive") {
    if (sources.length < 1)
      throw new Error(
        "Moving files to the archive needs a local project folder. Choose keep files instead.",
      );
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
        throw new Error(
          "Another BB project lives inside this folder. Choose keep files or move that project first.",
        );
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
        throw new Error(
          "This folder is also a section of another project. Choose keep files or archive that section.",
        );
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
