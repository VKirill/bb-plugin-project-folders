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
  ],
  skills: ["project-folders", "markdown-pro", "bb-cli", "env-catalog"],
  mcpServers: ["bb-bridge"],
} as const satisfies Partial<Record<SessionPolicyGroup, readonly string[]>>;

/**
 * Required by the owner's choice rather than by BB, each plugin with the
 * skill its instructions point to: Markdown PRO (`md-editor`, `markdown-pro`)
 * shapes every .md file an agent writes and Env Catalog (`env-catalog`) hands
 * out keys. Listed in REQUIRED_SESSION_ITEMS; this set only picks the
 * editor's label. `bb-guide`/`bb-cli` are listed there too as BB's own, so
 * they hold before the built-in list is read.
 */
export const PINNED_SESSION_ITEMS: ReadonlySet<string> = new Set([
  "md-editor",
  "markdown-pro",
  "env-catalog",
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

export const sessionFilterSchema = z.object({
  mode: z.enum(["all", "allow", "deny"]),
  names: z.array(z.string().trim().min(1).max(NAME_MAX)).max(NAMES_MAX),
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
});
export type SessionPolicy = z.infer<typeof sessionPolicySchema>;

export const policyOriginSchema = z.object({
  scope: z.enum(["folder", "project", "global"]),
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

/** Drops empty and duplicate names; an `allow`/`deny` group always stays. */
export function normalizeSessionPolicy(value: SessionPolicy): SessionPolicy {
  const out: SessionPolicy = {};
  for (const group of SESSION_POLICY_GROUPS) {
    const filter = value[group];
    if (!filter) continue;
    out[group] = {
      mode: filter.mode,
      // Required items are never stored: they are always in the session.
      names:
        filter.mode === "all"
          ? []
          : [
              ...new Set(
                filter.names
                  .map((n) => n.trim())
                  .filter((n) => n && !isRequiredSessionItem(group, n)),
              ),
            ],
    };
  }
  for (const key of SESSION_POLICY_SWITCHES)
    if (value[key] !== undefined) out[key] = value[key];
  return out;
}

/** Nearest layer first; the first layer that sets a group wins it. */
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
    bbPlugins: pick("bbPlugins") as ResolvedSessionPolicy["bbPlugins"],
    skills: pick("skills") as ResolvedSessionPolicy["skills"],
    mcpServers: pick("mcpServers") as ResolvedSessionPolicy["mcpServers"],
    nativePlugins: pick(
      "nativePlugins",
    ) as ResolvedSessionPolicy["nativePlugins"],
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
export type SessionItems = Partial<Record<SessionPolicyGroup, readonly string[]>>;

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
