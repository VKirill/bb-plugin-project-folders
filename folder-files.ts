import { lstat, realpath, mkdir, rmdir } from "node:fs/promises";
import path from "node:path";
import type { ErrorId } from "./errors/catalog";
import { userError } from "./user-error";

/** Turns a raw Node file-system failure into a message that names the folder. */
function fsFailure(e: unknown, parent: string, target: string): unknown {
  const table: Record<string, [ErrorId, Record<string, string>]> = {
    EEXIST: ["file_folder_exists", { name: path.basename(target), parent }],
    ENOENT: ["fs_not_found", { path: target }],
    EACCES: ["fs_no_access", { path: parent }],
    EPERM: ["fs_no_access", { path: parent }],
    ENOTEMPTY: ["fs_not_empty", { path: target }],
    ENOSPC: ["fs_no_space", {}],
    EROFS: ["fs_read_only", { path: parent }],
    ENAMETOOLONG: ["fs_name_too_long", { path: target }],
    EBUSY: ["fs_busy", { path: target }],
  };
  const hit = table[(e as NodeJS.ErrnoException)?.code ?? ""];
  return hit ? userError(hit[0], hit[1]) : e;
}
export async function editFolder(input: {
  protectedPaths?: string[];
  parent: string;
  name: string;
  action: "create" | "delete";
}) {
  if (
    !path.isAbsolute(input.parent) ||
    !input.name.trim() ||
    input.name !== input.name.trim() ||
    input.name === "." ||
    input.name === ".." ||
    /[\\/\x00-\x1f]/.test(input.name)
  ) {
    if (!path.isAbsolute(input.parent))
      throw userError("file_parent_not_absolute", { parent: input.parent });
    throw userError("file_folder_name_invalid", { name: input.name });
  }
  let parent: string;
  try {
    parent = await realpath(input.parent);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      throw userError("file_parent_missing", { parent: input.parent });
    throw fsFailure(e, input.parent, input.parent);
  }
  const target = path.join(parent, input.name);
  if (input.action === "create") {
    try {
      await mkdir(target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        throw userError("file_parent_missing", { parent });
      throw fsFailure(e, parent, target);
    }
  } else {
    for (const protectedPath of input.protectedPaths ?? []) {
      let resolved: string;
      try {
        resolved = await realpath(protectedPath);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw e;
      }
      if (resolved === target)
        throw userError("file_folder_protected", { path: target });
    }
    try {
      const stat = await lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw userError("file_folder_not_deletable", { path: target });
      await rmdir(target);
    } catch (e) {
      throw fsFailure(e, parent, target);
    }
  }
  return { path: target };
}
