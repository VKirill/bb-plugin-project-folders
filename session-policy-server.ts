import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { existsSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { moveHostContract } from "./move-contract";
import { within } from "./move-files";
import type { SessionInventory } from "./session-inventory";
import {
  normalizeSessionPolicy,
  resolveSessionPolicy,
  sessionPolicySchema,
  toCorePolicy,
  type PolicyOrigin,
  type SessionItems,
  type SessionPolicy,
  type SessionPolicyLayer,
} from "./session-policy";

type Folder = {
  id: string;
  projectId: string;
  hostId: string;
  parentId: string | null;
  path: string;
  kind?: string;
};
type Scope =
  | { kind: "global" }
  | { kind: "project"; projectId: string }
  | { kind: "folder"; projectId: string; folderId: string };

/** The thread facts core hands a session policy resolver. */
type PolicyContext = {
  project: { id: string };
  host: { id: string };
  environment: { path: string | null };
};
type VkContribution = {
  pluginId: string;
  required?: boolean;
  instructions: boolean;
  configure: boolean;
  tools: string[];
  skills: string[];
};
type VkAgents = {
  experimental_vkContextContributions?: () => VkContribution[];
  experimental_vkSessionPolicy?: (
    resolver: (context: PolicyContext) => Record<string, unknown> | null,
  ) => void;
};

/**
 * Session context rules: storage per place, inheritance down the tree, and
 * the answer to core's per-thread question. Registers with core only when the
 * running BB has the experimental session-policy extension.
 */
export function makeSessionPolicies(args: {
  bb: BbPluginApi;
  db: Database.Database;
  folders: () => Folder[];
  canonicalPath: (hostId: string, p: string) => string;
  place: (
    scope: Scope,
  ) => Promise<{ folder: Folder | null; hostId: string | null }>;
}) {
  const { bb, db } = args;
  const agents = bb.agents as unknown as VkAgents;
  const available = typeof agents.experimental_vkSessionPolicy === "function";

  const key = (scope: Scope) =>
    scope.kind === "global"
      ? "g"
      : scope.kind === "project"
        ? `p:${scope.projectId}`
        : `f:${scope.folderId}`;
  const read = (k: string): SessionPolicy => {
    const row = db
      .prepare("SELECT data FROM session_policies WHERE key=?")
      .get(k) as { data: string } | undefined;
    if (!row) return {};
    try {
      const parsed = sessionPolicySchema.safeParse(JSON.parse(row.data));
      return parsed.success ? normalizeSessionPolicy(parsed.data) : {};
    } catch {
      return {};
    }
  };
  const write = (k: string, value: SessionPolicy) => {
    const clean = normalizeSessionPolicy(value);
    if (Object.keys(clean).length === 0)
      db.prepare("DELETE FROM session_policies WHERE key=?").run(k);
    else
      db.prepare(
        "INSERT INTO session_policies (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
      ).run(k, JSON.stringify(clean));
  };
  const origin = (scope: Scope): PolicyOrigin => ({
    scope: scope.kind,
    folderId: scope.kind === "folder" ? scope.folderId : null,
  });

  /** Nearest first: the section, its parents, the project, the plugin. */
  const layers = (
    f: Folder | null,
    projectId: string,
    skipOwn = false,
  ): SessionPolicyLayer[] => {
    const out: SessionPolicyLayer[] = [];
    const all = args.folders();
    let cur: Folder | undefined = f ?? undefined;
    const visited = new Set<string>();
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      if (!(skipOwn && cur === f))
        out.push({
          origin: { scope: "folder", folderId: cur.id },
          value: read(`f:${cur.id}`),
        });
      cur = cur.parentId ? all.find((x) => x.id === cur!.parentId) : undefined;
    }
    if (!(skipOwn && f === null))
      out.push({
        origin: { scope: "project", folderId: null },
        value: read(`p:${projectId}`),
      });
    out.push({ origin: { scope: "global", folderId: null }, value: read("g") });
    return out;
  };

  /** The deepest registered section whose folder holds the workspace. */
  const folderFor = (ctx: PolicyContext): Folder | null => {
    if (!ctx.environment.path) return null;
    const p = args.canonicalPath(ctx.host.id, ctx.environment.path);
    let best: Folder | null = null;
    for (const f of args.folders()) {
      if (f.kind === "group" || !f.path) continue;
      if (f.projectId !== ctx.project.id || f.hostId !== ctx.host.id) continue;
      if (!within(p, f.path)) continue;
      if (!best || f.path.length > best.path.length) best = f;
    }
    return best;
  };

  /**
   * BB's own plugins (`provenance: "builtin"`) and their skills: no rule takes
   * them out. Core's resolver call is synchronous, so the plugin list is read
   * ahead and refreshed when the editor loads; the skills come from core's
   * live contribution list each time.
   */
  let builtinPlugins: readonly string[] = [];
  const refreshBuiltins = () =>
    bb.sdk.plugins
      .list()
      .then((r) => {
        builtinPlugins = r.plugins
          .filter((p) => p.provenance === "builtin")
          .map((p) => p.id);
      })
      .catch(() => {});
  const systemItems = (): SessionItems => {
    const ids = new Set(builtinPlugins);
    return {
      bbPlugins: builtinPlugins,
      skills: (agents.experimental_vkContextContributions?.() ?? [])
        .filter((c) => ids.has(c.pluginId))
        .flatMap((c) => c.skills),
    };
  };

  if (available) {
    void refreshBuiltins();
    agents.experimental_vkSessionPolicy!((ctx) =>
      toCorePolicy(
        resolveSessionPolicy(layers(folderFor(ctx), ctx.project.id)),
        systemItems(),
      ),
    );
  }

  return {
    available,
    read: async (scope: Scope) => {
      const place = await args.place(scope);
      const own = read(key(scope));
      const parents =
        scope.kind === "global"
          ? []
          : layers(place.folder, scope.projectId, true);
      // The BB-wide instructions file the "user instructions" switch governs:
      // shown by path, and flagged when there is nothing to switch off.
      const file = path.join(bb.server.experimental_dataDir, "AGENTS.md");
      return {
        own,
        userInstructionsFile: { path: file, exists: existsSync(file) },
        inherited: resolveSessionPolicy(parents),
        effective: resolveSessionPolicy([
          { origin: origin(scope), value: own },
          ...parents,
        ]),
      };
    },
    save: async (scope: Scope, value: SessionPolicy) => {
      await args.place(scope);
      write(key(scope), value);
    },
    /** Names to offer in the editor; every source is best effort. */
    inventory: async (scope: Scope) => {
      const place = await args.place(scope);
      await refreshBuiltins();
      const system = systemItems();
      const isSystem = (group: "bbPlugins" | "skills", name: string) =>
        system[group]?.includes(name) ? { required: true } : {};
      // What each plugin adds to agent sessions, when BB can tell.
      const contributions = new Map(
        (agents.experimental_vkContextContributions?.() ?? []).map((c) => [
          c.pluginId,
          {
            ...(c.required ? { required: true } : {}),
            instructions: c.instructions,
            configure: c.configure,
            tools: c.tools.length,
            skills: c.skills.length,
          },
        ]),
      );
      const plugins = await bb.sdk.plugins
        .list()
        .then((r) =>
          r.plugins.map((p) => {
            const adds = contributions.get(p.id);
            return {
              name: p.id,
              label: p.name ?? p.id,
              ...isSystem("bbPlugins", p.id),
              ...(adds ? { adds } : {}),
            };
          }),
        )
        .catch(() => []);
      let skills: { name: string; label: string; required?: boolean }[] = [];
      let machine: SessionInventory = { mcpServers: [], nativePlugins: [] };
      if (scope.kind !== "global") {
        skills = await bb.sdk.skills
          .list({ projectId: scope.projectId, environmentId: null })
          .then((r) =>
            r.skills.map((s) => ({
              name: s.name,
              label: s.pluginId ? `${s.name} · ${s.pluginId}` : s.name,
              ...isSystem("skills", s.name),
            })),
          )
          .catch(() => []);
        const cwd = place.folder?.path ?? null;
        if (place.hostId)
          machine = await bb.hosts
            .experimental_client({ contract: moveHostContract })
            .call("session_inventory", { cwd }, { hostId: place.hostId })
            .catch(() => machine);
      }
      const unique = <T extends { name: string }>(items: T[]) =>
        [...new Map(items.map((i) => [i.name, i])).values()].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      return {
        bbPlugins: unique(plugins),
        skills: unique(skills),
        mcpServers: machine.mcpServers.map((m) => ({
          name: m.name,
          label: `${m.name} · ${m.sources.join(", ")}`,
        })),
        nativePlugins: machine.nativePlugins.map((m) => ({
          name: m.name,
          label: `${m.name} · ${m.sources.join(", ")}`,
        })),
      };
    },
  };
}
