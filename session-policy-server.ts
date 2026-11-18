import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { existsSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { z } from "zod";
import { moveHostContract } from "./move-contract";
import { within } from "./move-files";
import type { SessionInventory } from "./session-inventory";
import {
  bindSkills,
  isSubthread,
  normalizeSessionPolicy,
  PINNED_PLUGIN_IDS,
  resolveSessionPolicy,
  SUBTHREAD_ORIGIN,
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
  name?: string;
};
type Scope =
  | { kind: "global" }
  | { kind: "subthreads" }
  | { kind: "project"; projectId: string }
  | { kind: "folder"; projectId: string; folderId: string };

/** The thread facts core hands a session policy resolver. */
type PolicyContext = {
  thread?: { parentThreadId: string | null };
  origin?: { kind: "fork" | null; pluginId: string | null } | null;
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

/** Where Agent tools filed a skill, in both languages, and its place in the tree. */
export type SkillCategory = {
  path: string[];
  pathEn: string[];
  order: number;
};

const title = z.object({
  id: z.string(),
  title: z.string(),
  titleEn: z.string(),
});
const skillsHubSchema = z.object({
  tree: z.object({
    sections: z.array(
      title.extend({ subsections: z.array(title).default([]) }),
    ),
  }),
  skills: z.array(
    z.object({
      name: z.string(),
      category: z
        .object({ sectionId: z.string(), subsectionId: z.string().nullish() })
        .nullish(),
    }),
  ),
});

/**
 * The category tree of the Agent tools plugin's skill hub, by skill name.
 * Empty when that plugin is missing or does not answer: the editor then shows
 * a flat list.
 */
async function skillCategories(
  bb: BbPluginApi,
): Promise<Map<string, SkillCategory>> {
  const out = new Map<string, SkillCategory>();
  const hub = await bb.sdk.plugins
    .callRpc({
      pluginId: "agent-tools",
      method: "skills_hub",
      input: null,
      outputSchema: skillsHubSchema,
    })
    .catch(() => null);
  if (!hub) return out;
  const sections = new Map(hub.tree.sections.map((s, i) => [s.id, { s, i }]));
  for (const skill of hub.skills) {
    const at = skill.category && sections.get(skill.category.sectionId);
    if (!at) continue;
    const j = at.s.subsections.findIndex(
      (x) => x.id === skill.category!.subsectionId,
    );
    const sub = j >= 0 ? at.s.subsections[j] : undefined;
    out.set(skill.name, {
      path: sub ? [at.s.title, sub.title] : [at.s.title],
      pathEn: sub ? [at.s.titleEn, sub.titleEn] : [at.s.titleEn],
      order: at.i * 1000 + (j >= 0 ? j : 999),
    });
  }
  return out;
}

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
    scope: Exclude<Scope, { kind: "subthreads" }>,
  ) => Promise<{ folder: Folder | null; hostId: string | null }>;
}) {
  const { bb, db } = args;
  const agents = bb.agents as unknown as VkAgents;
  const available = typeof agents.experimental_vkSessionPolicy === "function";

  const key = (scope: Scope) =>
    scope.kind === "global"
      ? "g"
      : scope.kind === "subthreads"
        ? "s"
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

  /** Each project's main folder and name, read ahead like the built-ins. */
  let projects = new Map<
    string,
    { name: string; hostId?: string; path?: string }
  >();
  const refreshProjects = () =>
    bb.sdk.projects
      .list()
      .then((list) => {
        projects = new Map(
          list.map((p) => {
            const s = p.sources.find((x) => x.isDefault) ?? p.sources[0];
            return [p.id, { name: p.name, hostId: s?.hostId, path: s?.path }];
          }),
        );
      })
      .catch(() => {});

  /** Every place's bound skills: `p:<id>`/`f:<id>` → names. */
  const bindings = () => {
    const out = new Map<string, string[]>();
    const rows = db
      .prepare(
        "SELECT key FROM session_policies WHERE key LIKE 'p:%' OR key LIKE 'f:%'",
      )
      .all() as { key: string }[];
    for (const { key: k } of rows) {
      const only = read(k).onlyHere;
      if (only?.length) out.set(k, only);
    }
    return out;
  };
  /**
   * Places whose bound skills a chat here gets: the section and its parents,
   * and the project when the section lies inside the project's own folder (a
   * section kept elsewhere is a separate thing that only shares the project).
   */
  const bindingKeys = (f: Folder | null, projectId: string) => {
    const keys = layers(f, projectId)
      .filter((l) => l.origin.scope === "folder")
      .map((l) => `f:${l.origin.folderId}`);
    const root = projects.get(projectId);
    const anchor = keys.length
      ? args.folders().find((x) => `f:${x.id}` === keys[keys.length - 1])
      : null;
    if (
      !anchor?.path ||
      !root?.path ||
      (anchor.hostId === root.hostId &&
        within(
          args.canonicalPath(anchor.hostId, anchor.path),
          args.canonicalPath(anchor.hostId, root.path),
        ))
    )
      keys.push(`p:${projectId}`);
    return keys;
  };
  const placeName = (k: string) =>
    k.startsWith("p:")
      ? (projects.get(k.slice(2))?.name ?? k.slice(2))
      : (args.folders().find((x) => x.id === k.slice(2))?.name ?? k.slice(2));
  /** Bound skills on for this place, off for the rest. */
  const withBindings = (
    resolved: ReturnType<typeof resolveSessionPolicy>,
    f: Folder | null,
    projectId: string | null,
  ) => {
    const all = bindings();
    const mine = new Set(projectId ? bindingKeys(f, projectId) : []);
    const here = new Set<string>();
    const elsewhere = new Set<string>();
    for (const [k, names] of all)
      for (const n of names) (mine.has(k) ? here : elsewhere).add(n);
    return bindSkills(resolved, here, elsewhere);
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
  const skillsOf = (ids: ReadonlySet<string>) =>
    (agents.experimental_vkContextContributions?.() ?? [])
      .filter((c) => ids.has(c.pluginId))
      .flatMap((c) => c.skills);
  // Pinned plugins keep their skills like BB's built-ins do.
  const pinnedPlugins: ReadonlySet<string> = new Set(PINNED_PLUGIN_IDS);
  const systemItems = (): SessionItems => ({
    bbPlugins: builtinPlugins,
    skills: skillsOf(new Set([...builtinPlugins, ...pinnedPlugins])),
  });

  if (available) {
    void refreshBuiltins();
    void refreshProjects();
    agents.experimental_vkSessionPolicy!((ctx) => {
      const folder = folderFor(ctx);
      const place = layers(folder, ctx.project.id);
      // A subthread takes the place's rules with the subthread rule on top.
      const sub = isSubthread(ctx)
        ? [{ origin: SUBTHREAD_ORIGIN, value: read("s") }]
        : [];
      return toCorePolicy(
        withBindings(
          resolveSessionPolicy([...sub, ...place]),
          folder,
          ctx.project.id,
        ),
        systemItems(),
      );
    });
  }

  return {
    available,
    read: async (scope: Scope) => {
      const own = read(key(scope));
      await refreshProjects();
      const folder =
        scope.kind === "global" || scope.kind === "subthreads"
          ? null
          : (await args.place(scope)).folder;
      // The subthread rule sits over whatever place a subthread runs in, so
      // it has nothing of its own to inherit here.
      const parents =
        scope.kind === "global" || scope.kind === "subthreads"
          ? []
          : layers(folder, scope.projectId, true);
      // Bound skills: from a place above (on here, locked) and from places
      // elsewhere (off here, locked), each with where it is bound.
      const mine = new Set(
        "projectId" in scope ? bindingKeys(folder, scope.projectId) : [],
      );
      const boundAbove: Record<string, string[]> = {};
      const boundElsewhere: Record<string, string[]> = {};
      for (const [k, names] of bindings()) {
        if (k === key(scope)) continue;
        const into = mine.has(k) ? boundAbove : boundElsewhere;
        for (const n of names) (into[n] ??= []).push(placeName(k));
      }
      for (const n of Object.keys(boundElsewhere))
        if (boundAbove[n] || own.onlyHere?.includes(n))
          delete boundElsewhere[n];
      // The BB-wide instructions file the "user instructions" switch governs:
      // shown by path, and flagged when there is nothing to switch off.
      const file = path.join(bb.server.experimental_dataDir, "AGENTS.md");
      return {
        own,
        boundAbove,
        boundElsewhere,
        userInstructionsFile: { path: file, exists: existsSync(file) },
        inherited: resolveSessionPolicy(parents),
        effective: resolveSessionPolicy([
          { origin: origin(scope), value: own },
          ...parents,
        ]),
      };
    },
    save: async (scope: Scope, value: SessionPolicy) => {
      if (scope.kind !== "subthreads") await args.place(scope);
      // Only a project or a section can hold skills of its own.
      write(
        key(scope),
        "projectId" in scope ? value : { ...value, onlyHere: undefined },
      );
    },
    /** Names to offer in the editor; every source is best effort. */
    inventory: async (scope: Scope) => {
      const place =
        scope.kind === "subthreads"
          ? { folder: null, hostId: null }
          : await args.place(scope);
      await refreshBuiltins();
      const system = systemItems();
      const pinnedSkills = new Set(skillsOf(pinnedPlugins));
      const isSystem = (group: "bbPlugins" | "skills", name: string) =>
        group === "skills" && pinnedSkills.has(name)
          ? { required: true, pinned: true }
          : system[group]?.includes(name)
            ? { required: true }
            : {};
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
      let skills: {
        name: string;
        label: string;
        required?: boolean;
        pinned?: boolean;
        category?: SkillCategory;
      }[] = [];
      let machine: SessionInventory = { mcpServers: [], nativePlugins: [] };
      // Plugin-wide rules list the skills of any project: BB's, the user's
      // and plugins' skills are the same everywhere, project skills aside.
      const projectId =
        "projectId" in scope ? scope.projectId : args.folders()[0]?.projectId;
      if (projectId) {
        const [list, categories] = await Promise.all([
          bb.sdk.skills
            .list({ projectId, environmentId: null })
            .catch(() => ({ skills: [] })),
          skillCategories(bb),
        ]);
        skills = list.skills.map((s) => {
          const category = categories.get(s.name);
          return {
            name: s.name,
            label: s.pluginId ? `${s.name} · ${s.pluginId}` : s.name,
            ...isSystem("skills", s.name),
            ...(category ? { category } : {}),
          };
        });
      }
      if ("projectId" in scope) {
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
