import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Main checkout of a linked git worktree (`git worktree add`), or null for a
 * main checkout, a submodule, a bare repository or a folder outside git.
 */
export async function worktreeMainPath(dir: string): Promise<string | null> {
  try {
    if (!dir || !path.isAbsolute(dir)) return null;
    const marker = path.join(dir, ".git");
    if (!(await stat(marker)).isFile()) return null;
    const line = (await readFile(marker, "utf8")).match(
      /^gitdir:\s*(.+?)\s*$/m,
    );
    if (!line) return null;
    const gitdir = path.resolve(dir, line[1]);
    // Only linked worktrees carry commondir; submodules do not.
    const common = (
      await readFile(path.join(gitdir, "commondir"), "utf8")
    ).trim();
    if (!common) return null;
    const commonDir = path.resolve(gitdir, common);
    if (path.basename(commonDir) !== ".git") return null;
    const main = path.dirname(commonDir);
    return main === path.resolve(dir) ? null : main;
  } catch {
    return null;
  }
}

export async function worktreeOrigins(input: { paths: string[] }): Promise<{
  origins: { path: string; main: string | null }[];
}> {
  const origins = [];
  for (const dir of input.paths) {
    origins.push({ path: dir, main: await worktreeMainPath(dir) });
  }
  return { origins };
}
