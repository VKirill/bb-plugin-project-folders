import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { worktreeMainPath, worktreeOrigins } from "./worktree-origin";

let base: string;
beforeEach(() => {
  base = realpathSync(mkdtempSync(path.join(tmpdir(), "pf-worktree-")));
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, stdio: "ignore" });

it("finds the main checkout of a worktree that git created beside it", async () => {
  const main = path.join(base, "bb-plugin-lane-pilot");
  mkdirSync(main);
  git(main, "init", "-q", "-b", "main");
  git(main, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  const wt = path.join(base, "bb-plugin-lane-pilot-feature-x");
  git(main, "worktree", "add", "-q", "-b", "feature/x", wt);
  const nested = path.join(base, "helper", "worktrees", "feature-x-3");
  git(main, "worktree", "add", "-q", "--detach", nested);

  expect(await worktreeMainPath(wt)).toBe(main);
  expect(await worktreeMainPath(nested)).toBe(main);
  expect(await worktreeMainPath(main)).toBeNull();
});

it("leaves submodules, plain folders and bad paths alone", async () => {
  const sub = path.join(base, "sub");
  mkdirSync(path.join(base, "repo", ".git", "modules", "sub"), { recursive: true });
  mkdirSync(sub);
  writeFileSync(path.join(sub, ".git"), "gitdir: ../repo/.git/modules/sub\n");
  const plain = path.join(base, "plain");
  mkdirSync(plain);

  expect(await worktreeMainPath(sub)).toBeNull();
  expect(await worktreeMainPath(plain)).toBeNull();
  expect(await worktreeMainPath(path.join(base, "missing"))).toBeNull();
  expect(await worktreeMainPath("relative/path")).toBeNull();
  expect(await worktreeOrigins({ paths: [plain] })).toEqual({
    origins: [{ path: plain, main: null }],
  });
});
