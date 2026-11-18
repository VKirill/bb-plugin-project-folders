import { z } from "zod";

/**
 * Session context rules: which BB plugins, skills, MCP servers and CLI
 * plugins an agent session started here loads.
 *
 * Enforcement lives in an experimental core extension
 * (`bb.agents.experimental_vkSessionPolicy`) that stock BB does not have. The
 * plugin only stores the rules and answers core's question per thread; on a
 * BB build without the extension the feature is hidden and nothing is sent.
 *
 * Inheritance works per group, like execution defaults: the nearest place
 * that sets a group wins — the section, its parents, the project, then the
 * plugin-wide default. `all` explicitly lifts a restriction a parent set.
 */
export const SESSION_POLICY_GROUPS = [
  "bbPlugins",
  "skills",
  "mcpServers",
  "nativePlugins",
] as const;
export type SessionPolicyGroup = (typeof SESSION_POLICY_GROUPS)[number];

/** On/off switches; absent means BB's default, which is on. */
export const SESSION_POLICY_SWITCHES = [
  "userInstructions",
  "projectInstructions",
  "claudeAiSync",
] as const;
export type SessionPolicySwitch = (typeof SESSION_POLICY_SWITCHES)[number];

/**
 * Items no rule may take out of a session: BB cannot start or show threads
 * without them. `environment-project-checkout` provisions the thread's
 * environment, `project-folders` supplies these rules (core never excludes
 * it either), and `bb-bridge` is the MCP server that carries BB's own and
 * every plugin's tools. They stay loaded whatever a group says.
 */
export const REQUIRED_SESSION_ITEMS = {
  bbPlugins: [
    "environment-project-checkout",
    "project-folders",
    "md-editor",
    "bb-guide",
    "env-catalog",
    "aif-chat",
    "lane-pilot",
  ],
  skills: ["project-folders", "markdown-pro", "bb-cli", "env-catalog"],
  mcpServers: ["bb-bridge"],
} as const satisfies Partial<Record<SessionPolicyGroup, readonly string[]>>;

/**
 * Plugins required by the owner's choice rather than by BB: Markdown PRO
 * (`md-editor`) shapes every .md file an agent writes, Env Catalog hands out
 * keys, AIF Helper (`aif-chat`) and Lane Pilot run the owner's workflows.
 * Each stays in every session with every skill it ships (the server adds
 * those like BB's built-ins). Listed in REQUIRED_SESSION_ITEMS.
 */
export const PINNED_PLUGIN_IDS = [
  "md-editor",
  "env-catalog",
  "aif-chat",
  "lane-pilot",
] as const;

/**
 * Only picks the editor's label. `bb-guide`/`bb-cli` are in
 * REQUIRED_SESSION_ITEMS too as BB's own, so they hold before the built-in
 * list is read.
 */
export const PINNED_SESSION_ITEMS: ReadonlySet<string> = new Set([
  ...PINNED_PLUGIN_IDS,
  "markdown-pro",
]);

/** Required items BB always has, so the editor lists them even when no inventory does. */
export const BUILT_IN_SESSION_ITEMS: Partial<
  Record<SessionPolicyGroup, readonly string[]>
> = { mcpServers: ["bb-bridge"] };

export function isRequiredSessionItem(
  group: SessionPolicyGroup,
  name: string,
): boolean {
  const required: readonly string[] =
    (
      REQUIRED_SESSION_ITEMS as Partial<
        Record<SessionPolicyGroup, readonly string[]>
      >
    )[group] ?? [];
  return required.includes(name);
}

const NAME_MAX = 200;
const NAMES_MAX = 500;

/**
 * `adjust` keeps what the place above resolves to and changes single items:
 * `names` are switched off here, `enable` switched back on. A resolved group
 * is never `adjust`; core only ever sees `allow`/`deny`.
 */
export const sessionFilterSchema = z.object({
  mode: z.enum(["all", "allow", "deny", "adjust"]),
  names: z.array(z.string().trim().min(1).max(NAME_MAX)).max(NAMES_MAX),
  enable: z
    .array(z.string().trim().min(1).max(NAME_MAX))
    .max(NAMES_MAX)
    .optional(),
});
export type SessionFilter = z.infer<typeof sessionFilterSchema>;

export const sessionPolicySchema = z.object({
  bbPlugins: sessionFilterSchema.optional(),
  skills: sessionFilterSchema.optional(),
  mcpServers: sessionFilterSchema.optional(),
  nativePlugins: sessionFilterSchema.optional(),
  userInstructions: z.boolean().optional(),
  projectInstructions: z.boolean().optional(),
  claudeAiSync: z.boolean().optional(),
  /**
   * Skills bound to this place: loaded in its chats whatever the groups say,
   * and in no chat anywhere else. A project binds them to its own folder and
   * the sections inside it; a section, to itself and its subsections.
   */
  onlyHere: z
    .array(z.string().trim().min(1).max(NAME_MAX))
    .max(NAMES_MAX)
    .optional(),
});
export type SessionPolicy = z.infer<typeof sessionPolicySchema>;

export const policyOriginSchema = z.object({
  scope: z.enum(["folder", "project", "global", "subthreads"]),
  folderId: z.string().nullable(),
});
export type PolicyOrigin = z.infer<typeof policyOriginSchema>;

export const resolvedSessionPolicySchema = z.object({
  bbPlugins: z
    .object({ value: sessionFilterSchema, origin: policyOriginSchema })
    .nullable(),
  skills: z
    .object({ value: sessionFilterSchema, origin: policyOriginSchema })
    .nullable(),
  mcpServers: z
    .object({ value: sessionFilterSchema, origin: policyOriginSchema })
    .nullable(),
  nativePlugins: z
    .object({ value: sessionFilterSchema, origin: policyOriginSchema })
    .nullable(),
  userInstructions: z
    .object({ value: z.boolean(), origin: policyOriginSchema })
    .nullable(),
  projectInstructions: z
    .object({ value: z.boolean(), origin: policyOriginSchema })
    .nullable(),
  claudeAiSync: z
    .object({ value: z.boolean(), origin: policyOriginSchema })
    .nullable(),
});
export type ResolvedSessionPolicy = z.infer<typeof resolvedSessionPolicySchema>;

export interface SessionPolicyLayer {
  origin: PolicyOrigin;
  value: SessionPolicy;
}

/** Drops empty and duplicate names; an `allow`/`deny`/`adjust` group always stays. */
export function normalizeSessionPolicy(value: SessionPolicy): SessionPolicy {
  const out: SessionPolicy = {};
  for (const group of SESSION_POLICY_GROUPS) {
    const filter = value[group];
    if (!filter) continue;
    // Required items are never stored: they are always in the session.
    const clean = (names: readonly string[]) => [
      ...new Set(
        names
          .map((n) => n.trim())
          .filter((n) => n && !isRequiredSessionItem(group, n)),
      ),
    ];
    if (filter.mode === "adjust") {
      const enable = clean(filter.enable ?? []);
      out[group] = {
        mode: "adjust",
        names: clean(filter.names).filter((n) => !enable.includes(n)),
        enable,
      };
      continue;
    }
    out[group] = {
      mode: filter.mode,
      names: filter.mode === "all" ? [] : clean(filter.names),
    };
  }
  for (const key of SESSION_POLICY_SWITCHES)
    if (value[key] !== undefined) out[key] = value[key];
  const only = [
    ...new Set(
      (value.onlyHere ?? [])
        .map((n) => n.trim())
        .filter((n) => n && !isRequiredSessionItem("skills", n)),
    ),
  ];
  if (only.length > 0) out.onlyHere = only;
  return out;
}

/**
 * Bound skills over the resolved skills: those bound to this place or above
 * are switched on, those bound only elsewhere switched off.
 */
export function bindSkills(
  resolved: ResolvedSessionPolicy,
  here: ReadonlySet<string>,
  elsewhere: ReadonlySet<string>,
): ResolvedSessionPolicy {
  const away = [...elsewhere].filter((n) => !here.has(n));
  if (here.size === 0 && away.length === 0) return resolved;
  const filter = resolved.skills?.value;
  const names = new Set(filter?.mode === "all" ? [] : filter?.names);
  const [add, drop] =
    filter?.mode === "allow" ? [[...here], away] : [away, [...here]];
  for (const n of drop) names.delete(n);
  for (const n of add) names.add(n);
  const mode = filter?.mode === "allow" ? "allow" : "deny";
  return {
    ...resolved,
    skills: {
      value:
        mode === "deny" && names.size === 0
          ? { mode: "all", names: [] }
          : { mode, names: [...names] },
      origin: resolved.skills?.origin ?? { scope: "global", folderId: null },
    },
  };
}

/** The plugin-wide rule for subthreads, laid over the place's own rules. */
export const SUBTHREAD_ORIGIN: PolicyOrigin = {
  scope: "subthreads",
  folderId: null,
};

/**
 * A subthread: a chat an agent started under another chat (`bb thread spawn`
 * with a parent). Not a side chat or a fork the owner opened, and not a helper
 * another plugin spawned (Lane Pilot gives those their own profile).
 */
export function isSubthread(ctx: {
  thread?: { parentThreadId: string | null };
  origin?: { kind: "fork" | null; pluginId: string | null } | null;
}): boolean {
  return (
    !!ctx.thread?.parentThreadId &&
    !ctx.origin?.pluginId &&
    ctx.origin?.kind !== "fork"
  );
}

type ResolvedFilter = { value: SessionFilter; origin: PolicyOrigin } | null;

/**
 * Nearest layer first. The nearest `all`/`allow`/`deny` layer sets the base;
 * `adjust` layers below it then switch single items, the farthest first. The
 * origin is the nearest layer that touched the group.
 */
function resolveFilter(
  layers: readonly SessionPolicyLayer[],
  group: SessionPolicyGroup,
): ResolvedFilter {
  const adjusts: { value: SessionFilter; origin: PolicyOrigin }[] = [];
  let base: ResolvedFilter = null;
  for (const layer of layers) {
    const value = layer.value[group];
    if (!value) continue;
    if (value.mode !== "adjust") {
      base = { value, origin: layer.origin };
      break;
    }
    adjusts.push({ value, origin: layer.origin });
  }
  if (adjusts.length === 0) return base;
  // Nothing above, or `all`: everything loads, so the changes form a deny list.
  const mode = base?.value.mode === "allow" ? "allow" : "deny";
  const names = new Set(
    base && mode === base.value.mode ? base.value.names : [],
  );
  for (const { value } of [...adjusts].reverse()) {
    const [add, drop] =
      mode === "allow"
        ? [value.enable ?? [], value.names]
        : [value.names, value.enable ?? []];
    for (const n of add) names.add(n);
    for (const n of drop) names.delete(n);
  }
  return {
    value:
      mode === "deny" && names.size === 0
        ? { mode: "all", names: [] }
        : { mode, names: [...names] },
    origin: adjusts[0]!.origin,
  };
}

export function resolveSessionPolicy(
  layers: readonly SessionPolicyLayer[],
): ResolvedSessionPolicy {
  const pick = <K extends keyof SessionPolicy>(key: K) => {
    for (const layer of layers) {
      const value = layer.value[key];
      if (value !== undefined) return { value, origin: layer.origin };
    }
    return null;
  };
  return {
    bbPlugins: resolveFilter(layers, "bbPlugins"),
    skills: resolveFilter(layers, "skills"),
    mcpServers: resolveFilter(layers, "mcpServers"),
    nativePlugins: resolveFilter(layers, "nativePlugins"),
    userInstructions: pick(
      "userInstructions",
    ) as ResolvedSessionPolicy["userInstructions"],
    projectInstructions: pick(
      "projectInstructions",
    ) as ResolvedSessionPolicy["projectInstructions"],
    claudeAiSync: pick("claudeAiSync") as ResolvedSessionPolicy["claudeAiSync"],
  };
}

/** Items a group may never lose beyond REQUIRED_SESSION_ITEMS, e.g. BB's built-in plugins and their skills. */
export type SessionItems = Partial<
  Record<SessionPolicyGroup, readonly string[]>
>;

/**
 * The policy core receives, or null when nothing narrows the session. `all`
 * groups are dropped: they only exist to override a parent here. `system`
 * names are kept like the required ones.
 */
export function toCorePolicy(
  resolved: ResolvedSessionPolicy,
  system: SessionItems = {},
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const group of SESSION_POLICY_GROUPS) {
    const filter = resolved[group]?.value;
    if (filter && filter.mode !== "all") {
      // An allow list keeps the required items; a deny list can't drop them.
      const required = new Set([
        ...((REQUIRED_SESSION_ITEMS as SessionItems)[group] ?? []),
        ...(system[group] ?? []),
      ]);
      const kept = filter.names.filter((name) => !required.has(name));
      out[group] = {
        mode: filter.mode,
        names: filter.mode === "allow" ? [...required, ...kept] : kept,
      };
    }
  }
  for (const key of SESSION_POLICY_SWITCHES)
    if (resolved[key]?.value === false) out[key] = false;
  return Object.keys(out).length > 0 ? out : null;
}

/** What each CLI enforces, for the hint next to the editor. */
export const SESSION_POLICY_SUPPORT = {
  "claude-code": ["bbPlugins", "skills", "mcpServers", "nativePlugins"],
  codex: ["bbPlugins", "skills", "mcpServers", "nativePlugins"],
  "acp-opencode": ["bbPlugins", "skills", "mcpServers"],
  "acp-cursor": ["bbPlugins", "mcpServers"],
} as const satisfies Record<string, readonly SessionPolicyGroup[]>;
