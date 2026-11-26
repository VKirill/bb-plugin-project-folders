import { lstat, realpath, rename, symlink, readlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { userError } from "./user-error";
export const within = (p: string, root: string) =>
  p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
async function stat(p: string) {
  try {
    return await lstat(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
export async function inspectMove(input: {
  source: string;
  destination: string;
}) {
  if (process.platform === "win32") throw userError("file_unsupported_os");
  const source = path.resolve(input.source),
    destination = path.resolve(input.destination);
  if (
    !path.isAbsolute(input.source) ||
    !path.isAbsolute(input.destination) ||
    /[\x00-\x1f]/.test(source + destination)
  )
    throw userError("file_paths_not_absolute");
  if (within(destination, source) || within(source, destination))
    throw userError("file_paths_nested", { source, destination });
  const src = await stat(source),
    dst = await stat(destination);
  const parent = await realpath(path.dirname(destination));
  if (parent !== path.dirname(destination))
    throw userError("file_dest_symlink_parent", { path: destination });
  if (
    src?.isSymbolicLink() &&
    dst?.isDirectory() &&
    (await readlink(source)) === destination
  )
    return { source, destination, moved: true };
  if (!src?.isDirectory() || src.isSymbolicLink())
    throw userError("file_source_not_dir", { path: source });
  if ((await realpath(source)) !== source)
    throw userError("file_source_symlink_parent", { path: source });
  const home = await realpath(os.homedir());
  for (const protectedPath of [
    home,
    process.cwd(),
    path.join(home, ".bb"),
    path.join(home, ".bb-machines"),
  ])
    if (within(protectedPath, source))
      throw userError("file_source_protected", { path: source });
  if (dst) throw userError("file_dest_exists", { path: destination });
  const parentStat = await lstat(parent);
  if (src.dev !== parentStat.dev)
    throw userError("file_other_volume", { path: source });
  // A linked worktree needs git worktree repair and its external repository; do not move it implicitly.
  if ((await stat(path.join(source, ".git")))?.isFile())
    throw userError("file_worktree_linked", { path: source });
  return { source, destination, moved: false };
}
export async function moveDirectory(input: {
  source: string;
  destination: string;
}) {
  const plan = await inspectMove(input);
  if (plan.moved) return plan;
  // rename is same-volume; all files, including dotfiles and internal symlinks, move together.
  await rename(plan.source, plan.destination);
  try {
    await symlink(plan.destination, plan.source, "dir");
  } catch (e) {
    // Do not undo over a path another process has created.
    if (!(await stat(plan.source))) await rename(plan.destination, plan.source);
    throw userError("file_link_failed", {
      source: plan.source,
      destination: plan.destination,
    });
  }
  return { ...plan, moved: true };
}

/** Re-link a section whose files already sit at the destination: the old
 * path becomes a compatibility symlink so existing chats keep working. */
export async function linkDirectory(input: {
  source: string;
  destination: string;
}) {
  const source = path.resolve(input.source),
    destination = path.resolve(input.destination);
  if (
    !path.isAbsolute(input.source) ||
    !path.isAbsolute(input.destination) ||
    /[\x00-\x1f]/.test(source + destination)
  )
    throw userError("file_paths_not_absolute");
  if (within(destination, source) || within(source, destination))
    throw userError("file_paths_nested", { source, destination });
  if (await stat(source))
    throw userError("file_original_exists", { path: source });
  const dst = await stat(destination);
  if (!dst?.isDirectory() || dst.isSymbolicLink())
    throw userError("file_dest_not_dir", { path: destination });
  if ((await realpath(destination)) !== destination)
    throw userError("file_dest_symlink_parent", { path: destination });
  await symlink(destination, source, "dir");
  return { source, destination, moved: true };
}
