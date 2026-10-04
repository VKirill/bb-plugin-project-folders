import { afterEach, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseRepoRemote,
  repoPrivateForUrl,
  repoProviderForUrl,
  repoRemotes,
  repoUrlForPath,
} from "./repo-remote";

const roots: string[] = [];
async function root() {
  const p = await mkdtemp(path.join(tmpdir(), "bb-repo-remote-"));
  roots.push(p);
  return p;
}
afterEach(async () => {
  for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true });
});

it("normalizes GitHub https, ssh and .git suffixes", () => {
  expect(parseRepoRemote("https://github.com/VKirill/bb-plugin-project-folders.git")).toBe(
    "https://github.com/VKirill/bb-plugin-project-folders",
  );
  expect(parseRepoRemote("https://github.com/acme/demo")).toBe(
    "https://github.com/acme/demo",
  );
  expect(parseRepoRemote("git@github.com:acme/demo.git")).toBe(
    "https://github.com/acme/demo",
  );
  expect(parseRepoRemote("ssh://git@github.com/acme/demo")).toBe(
    "https://github.com/acme/demo",
  );
  expect(parseRepoRemote("ssh://github.com/acme/demo.git")).toBe(
    "https://github.com/acme/demo",
  );
});

it("normalizes GitLab remotes with nested groups", () => {
  expect(parseRepoRemote("https://gitlab.com/acme/demo.git")).toBe(
    "https://gitlab.com/acme/demo",
  );
  expect(parseRepoRemote("git@gitlab.com:acme/platform/api.git")).toBe(
    "https://gitlab.com/acme/platform/api",
  );
  expect(parseRepoRemote("ssh://git@gitlab.com/acme/platform/api")).toBe(
    "https://gitlab.com/acme/platform/api",
  );
  expect(parseRepoRemote("https://oauth2:token@gitlab.com/acme/demo")).toBe(
    "https://gitlab.com/acme/demo",
  );
});

it("normalizes Bitbucket remotes", () => {
  expect(parseRepoRemote("https://vk@bitbucket.org/acme/demo.git")).toBe(
    "https://bitbucket.org/acme/demo",
  );
  expect(parseRepoRemote("git@bitbucket.org:acme/demo.git")).toBe(
    "https://bitbucket.org/acme/demo",
  );
  expect(parseRepoRemote("ssh://git@bitbucket.org/acme/demo.git")).toBe(
    "https://bitbucket.org/acme/demo",
  );
});

it("rejects other hosts, wrong depth and junk", () => {
  expect(parseRepoRemote("https://gitlab.example.com/acme/demo.git")).toBeNull();
  expect(parseRepoRemote("git@example.org:acme/demo.git")).toBeNull();
  expect(parseRepoRemote("https://github.com/acme/demo/extra")).toBeNull();
  expect(parseRepoRemote("https://bitbucket.org/acme/demo/extra")).toBeNull();
  expect(parseRepoRemote("https://gitlab.com/acme")).toBeNull();
  expect(parseRepoRemote("https://gitlab.com/acme/../demo")).toBeNull();
  expect(parseRepoRemote("https://github.com/acme/demo?x=1")).toBeNull();
  expect(parseRepoRemote("https://constructor/acme/demo")).toBeNull();
  expect(parseRepoRemote("not a remote")).toBeNull();
  expect(parseRepoRemote("")).toBeNull();
  expect(parseRepoRemote(null)).toBeNull();
  expect(parseRepoRemote("https://github.com.evil/acme/demo")).toBeNull();
});

it("names the provider of a normalized URL", () => {
  expect(repoProviderForUrl("https://github.com/acme/demo")).toBe("github");
  expect(repoProviderForUrl("https://gitlab.com/acme/a/b")).toBe("gitlab");
  expect(repoProviderForUrl("https://bitbucket.org/acme/demo")).toBe(
    "bitbucket",
  );
  expect(repoProviderForUrl("https://example.org/acme/demo")).toBeNull();
});

it("reads origin from a folder with a GitHub remote and skips missing git", async () => {
  const withOrigin = await root();
  await mkdir(path.join(withOrigin, ".git"));
  await writeFile(
    path.join(withOrigin, ".git", "config"),
    `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = git@github.com:VKirill/demo.git\n`,
  );
  const bare = await root();
  await mkdir(path.join(bare, ".git"));
  await writeFile(
    path.join(bare, ".git", "config"),
    `[core]\n\trepositoryformatversion = 0\n`,
  );
  const missing = await root();
  const worktree = await root();
  await writeFile(
    path.join(worktree, ".git"),
    `gitdir: ${path.join(withOrigin, ".git")}\n`,
  );
  const { remotes } = await repoRemotes({
    paths: [withOrigin, bare, missing, worktree],
  });
  expect(remotes).toEqual([
    { path: withOrigin, url: "https://github.com/VKirill/demo" },
    { path: bare, url: null },
    { path: missing, url: null },
    { path: worktree, url: "https://github.com/VKirill/demo" },
  ]);
  expect(await repoUrlForPath(missing)).toBeNull();
});

it("walks up to the checkout when the section is a nested folder", async () => {
  const repo = await root();
  await mkdir(path.join(repo, ".git"));
  await writeFile(
    path.join(repo, ".git", "config"),
    `[remote "origin"]\n\turl = https://github.com/VKirill/nested.git\n`,
  );
  const nested = path.join(repo, "src", "app");
  await mkdir(nested, { recursive: true });
  expect(await repoUrlForPath(nested)).toBe(
    "https://github.com/VKirill/nested",
  );
});

it("treats an anonymous 404 as private and 200 as public", async () => {
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const href = String(input);
    requested.push(href);
    if (href.includes("hidden")) return new Response("Not Found", { status: 404 });
    if (href.includes("open")) return new Response("{}", { status: 200 });
    return new Response("no", { status: 403 });
  }) as typeof fetch;
  try {
    expect(await repoPrivateForUrl("https://github.com/acme/hidden")).toBe(true);
    expect(await repoPrivateForUrl("https://github.com/acme/open")).toBe(false);
    expect(await repoPrivateForUrl("https://github.com/acme/other")).toBeNull();
    expect(await repoPrivateForUrl("https://gitlab.com/acme/sub/hidden")).toBe(
      true,
    );
    expect(await repoPrivateForUrl("https://bitbucket.org/acme/open")).toBe(
      false,
    );
    expect(await repoPrivateForUrl("https://example.org/acme/open")).toBeNull();
    expect(requested).toEqual([
      "https://api.github.com/repos/acme/hidden",
      "https://api.github.com/repos/acme/open",
      "https://api.github.com/repos/acme/other",
      "https://gitlab.com/api/v4/projects/acme%2Fsub%2Fhidden",
      "https://api.bitbucket.org/2.0/repositories/acme/open",
    ]);
  } finally {
    globalThis.fetch = original;
  }
});
