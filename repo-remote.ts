import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type RepoProvider = "github" | "gitlab" | "bitbucket";

const PROVIDER_HOSTS = new Map<string, RepoProvider>([
  ["github.com", "github"],
  ["gitlab.com", "gitlab"],
  ["bitbucket.org", "bitbucket"],
]);

const SEGMENT = /^[\w.-]+$/;

/** Turn a git remote string into https://<host>/<repo path>, or null. */
export function parseRepoRemote(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!value) return null;
  value = value.replace(/^git\+/, "");
  const match =
    value.match(/^https?:\/\/(?:[^@/]+@)?([^/:]+)\/(.+?)(?:\.git)?\/?$/i) ??
    value.match(/^git@([^/:]+):(.+?)(?:\.git)?\/?$/i) ??
    value.match(/^ssh:\/\/(?:git@)?([^/:]+)\/(.+?)(?:\.git)?\/?$/i);
  if (!match) return null;
  const host = match[1].toLowerCase();
  const provider = PROVIDER_HOSTS.get(host);
  if (!provider) return null;
  const segments = match[2].split("/");
  // GitLab nests projects in subgroups; GitHub and Bitbucket are owner/repo.
  if (provider === "gitlab" ? segments.length < 2 : segments.length !== 2)
    return null;
  if (segments.some((s) => !SEGMENT.test(s) || s === "." || s === ".."))
    return null;
  return `https://${host}/${segments.join("/")}`;
}

/** Provider of a URL that parseRepoRemote produced, or null. */
export function repoProviderForUrl(url: string): RepoProvider | null {
  const host = url.match(/^https:\/\/([^/]+)\//)?.[1];
  return host ? (PROVIDER_HOSTS.get(host) ?? null) : null;
}

function originUrlFromConfig(ini: string): string | null {
  let inOrigin = false;
  for (const line of ini.split(/\r?\n/)) {
    const section = line.match(/^\[(.+)\]\s*$/);
    if (section) {
      inOrigin = /^remote\s+"origin"$/i.test(section[1].trim());
      continue;
    }
    if (!inOrigin) continue;
    const kv = line.match(/^\s*url\s*=\s*(.+?)\s*$/i);
    if (kv) return kv[1].trim();
  }
  return null;
}

async function gitDir(folderPath: string): Promise<string | null> {
  try {
    const marker = path.join(folderPath, ".git");
    const info = await stat(marker);
    if (info.isDirectory()) return marker;
    if (!info.isFile()) return null;
    const text = await readFile(marker, "utf8");
    const line = text.match(/^gitdir:\s*(.+)\s*$/m);
    if (!line) return null;
    return path.resolve(folderPath, line[1].trim());
  } catch {
    return null;
  }
}

async function originAtGitDir(gitdir: string): Promise<string | null> {
  try {
    const local = await readFile(path.join(gitdir, "config"), "utf8");
    const url = originUrlFromConfig(local);
    if (url) return url;
  } catch {
    /* worktrees keep origin on the common git dir */
  }
  try {
    const common = (
      await readFile(path.join(gitdir, "commondir"), "utf8")
    ).trim();
    if (!common) return null;
    const shared = await readFile(
      path.join(path.resolve(gitdir, common), "config"),
      "utf8",
    );
    return originUrlFromConfig(shared);
  } catch {
    return null;
  }
}

/** Walk toward the filesystem root so a section inside a checkout still finds origin. */
export async function repoUrlForPath(folderPath: string): Promise<string | null> {
  try {
    if (!folderPath) return null;
    let current = path.resolve(folderPath);
    const root = path.parse(current).root;
    for (let i = 0; i < 16; i++) {
      const dir = await gitDir(current);
      if (dir) return parseRepoRemote(await originAtGitDir(dir));
      if (current === root) return null;
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
    return null;
  } catch {
    return null;
  }
}

function visibilityRequest(url: string): { href: string; init: RequestInit } | null {
  const repoPath = url.match(/^https:\/\/[^/]+\/(.+)$/)?.[1];
  if (!repoPath) return null;
  const init = {
    method: "GET",
    headers: { "User-Agent": "bb-plugin-project-folders" },
    signal: AbortSignal.timeout(4000),
  } satisfies RequestInit;
  switch (repoProviderForUrl(url)) {
    case "github":
      return {
        href: `https://api.github.com/repos/${repoPath}`,
        init: {
          ...init,
          headers: {
            ...init.headers,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      };
    case "gitlab":
      return {
        href: `https://gitlab.com/api/v4/projects/${encodeURIComponent(repoPath)}`,
        init,
      };
    case "bitbucket":
      return {
        href: `https://api.bitbucket.org/2.0/repositories/${repoPath}`,
        init,
      };
    default:
      return null;
  }
}

/** True when the provider hides the repo from an anonymous request (private or missing). */
export async function repoPrivateForUrl(url: string): Promise<boolean | null> {
  const request = visibilityRequest(url);
  if (!request) return null;
  try {
    const res = await fetch(request.href, request.init);
    if (res.status === 200) return false;
    if (res.status === 404) return true;
    return null;
  } catch {
    return null;
  }
}

export async function repoRemotes(input: { paths: string[] }): Promise<{
  remotes: { path: string; url: string | null }[];
}> {
  const remotes = [];
  for (const folderPath of input.paths) {
    remotes.push({
      path: folderPath,
      url: await repoUrlForPath(folderPath),
    });
  }
  return { remotes };
}
