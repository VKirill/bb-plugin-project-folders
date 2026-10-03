import { z } from "zod";

/**
 * Execution defaults: the provider, model, reasoning level, service tier,
 * permission mode and native session agent a new chat starts with.
 *
 * Nothing here replaces BB's own behaviour. A field that is not set anywhere
 * is simply absent, and the composer falls back to the project's remembered
 * execution defaults exactly as before — including the folder the chat
 * starts in. What the plugin adds is a place to pin those values per
 * project and per section, and inheritance down the tree: the nearest place
 * that sets a group wins.
 */
export const REASONING_LEVELS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
  "ultracode",
] as const;
export const SERVICE_TIERS = ["default", "fast"] as const;
export const PERMISSION_MODES = ["accept-edits", "auto", "full"] as const;
/** Where a new chat works: the place's own folder, or an isolated worktree. */
export const ENVIRONMENT_MODES = ["folder", "worktree"] as const;
/** The CLIs whose native session agents the CLI Agents plugin can bind. */
export const AGENT_PROVIDERS = [
  "claude-code",
  "codex",
  "acp-opencode",
] as const;
/** The plugin that owns agent discovery and binding; optional by design. */
export const CLI_AGENTS_PLUGIN_ID = "cli-agents";
export const CLI_AGENTS_URL = "https://github.com/VKirill/bb-plugin-cli-agents";

export type ReasoningLevel = (typeof REASONING_LEVELS)[number];
export type ServiceTier = (typeof SERVICE_TIERS)[number];
export type PermissionMode = (typeof PERMISSION_MODES)[number];
export type EnvironmentMode = (typeof ENVIRONMENT_MODES)[number];

export const executionSchema = z.object({
  /**
   * The provider and the model travel together: BB's picker resolves them as
   * one coherent value, and a model without its provider means nothing.
   */
  providerId: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(200).optional(),
  reasoningLevel: z.enum(REASONING_LEVELS).optional(),
  serviceTier: z.enum(SERVICE_TIERS).optional(),
  permissionMode: z.enum(PERMISSION_MODES).optional(),
  /**
   * Absent means "leave the environment alone": the chat still starts in this
   * folder (or the section provider). Pinning `folder` is how a section
   * refuses a worktree its project pinned.
   */
  environmentMode: z.enum(ENVIRONMENT_MODES).optional(),
  /**
   * The machine a new chat starts on. Absent leaves BB and the place's home
   * host alone. A host with no folder for this place falls back to home.
   */
  hostId: z.string().min(1).max(100).optional(),
  /**
   * "agent" pins `agentId`; "none" pins "no agent at all", which is how a
   * section refuses an agent its project pinned.
   */
  agentMode: z.enum(["none", "agent"]).optional(),
  agentId: z.string().min(1).max(200).optional(),
});
export type Execution = z.infer<typeof executionSchema>;

export const originSchema = z.object({
  scope: z.enum(["folder", "project", "global"]),
  folderId: z.string().nullable(),
});
export type Origin = z.infer<typeof originSchema>;

export const modelPinSchema = z.object({
  providerId: z.string(),
  model: z.string(),
  reasoningLevel: z.enum(REASONING_LEVELS).nullable(),
  serviceTier: z.enum(SERVICE_TIERS).nullable(),
});
export type ModelPin = z.infer<typeof modelPinSchema>;

export const agentPinSchema = z.object({
  mode: z.enum(["none", "agent"]),
  agentId: z.string().nullable(),
});
export type AgentPin = z.infer<typeof agentPinSchema>;

export const resolvedExecutionSchema = z.object({
  model: modelPinSchema.extend({ origin: originSchema }).nullable(),
  permissionMode: z
    .object({ value: z.enum(PERMISSION_MODES), origin: originSchema })
    .nullable(),
  environment: z
    .object({ value: z.enum(ENVIRONMENT_MODES), origin: originSchema })
    .nullable(),
  machine: z
    .object({ hostId: z.string(), origin: originSchema })
    .nullable(),
  agent: agentPinSchema.extend({ origin: originSchema }).nullable(),
});
export type ResolvedExecution = z.infer<typeof resolvedExecutionSchema>;

export type ExecutionLayer = { origin: Origin; value: Execution };

/** True when this place pins a provider and model of its own. */
export const hasModelPin = (value: Execution) =>
  !!value.providerId && !!value.model;
/** True when this place pins an agent, including an explicit "no agent". */
export const hasAgentPin = (value: Execution) =>
  value.agentMode === "none" ||
  (value.agentMode === "agent" && !!value.agentId);
/** True when this place pins the chat environment, including an explicit folder. */
export const hasEnvironmentPin = (value: Execution) =>
  value.environmentMode === "folder" || value.environmentMode === "worktree";
/** True when this place pins the machine a new chat starts on. */
export const hasMachinePin = (value: Execution) => !!value.hostId;

/**
 * Nearest place wins, one group at a time. The groups travel apart, so a
 * section can pin the agent alone and still take the model from its
 * project. Layers arrive nearest first: the section, its ancestors, the
 * project, then the plugin-wide default.
 */
export function resolveExecution(
  layers: readonly ExecutionLayer[],
): ResolvedExecution {
  const resolved: ResolvedExecution = {
    model: null,
    permissionMode: null,
    environment: null,
    machine: null,
    agent: null,
  };
  for (const { origin, value } of layers) {
    if (!resolved.model && hasModelPin(value))
      resolved.model = {
        providerId: value.providerId!,
        model: value.model!,
        reasoningLevel: value.reasoningLevel ?? null,
        serviceTier: value.serviceTier ?? null,
        origin,
      };
    if (!resolved.permissionMode && value.permissionMode)
      resolved.permissionMode = { value: value.permissionMode, origin };
    if (!resolved.environment && hasEnvironmentPin(value))
      resolved.environment = { value: value.environmentMode!, origin };
    if (!resolved.machine && hasMachinePin(value))
      resolved.machine = { hostId: value.hostId!, origin };
    if (!resolved.agent && hasAgentPin(value))
      resolved.agent = {
        mode: value.agentMode!,
        agentId: value.agentMode === "agent" ? (value.agentId ?? null) : null,
        origin,
      };
  }
  return resolved;
}

/** Drops the fields a group no longer owns, so an unset group stays absent. */
export function normalizeExecution(value: Execution): Execution {
  const out: Execution = {};
  if (hasModelPin(value)) {
    out.providerId = value.providerId;
    out.model = value.model;
    if (value.reasoningLevel) out.reasoningLevel = value.reasoningLevel;
    if (value.serviceTier) out.serviceTier = value.serviceTier;
  }
  if (value.permissionMode) out.permissionMode = value.permissionMode;
  if (hasEnvironmentPin(value)) out.environmentMode = value.environmentMode;
  if (hasMachinePin(value)) out.hostId = value.hostId;
  if (value.agentMode === "none") out.agentMode = "none";
  else if (value.agentMode === "agent" && value.agentId) {
    out.agentMode = "agent";
    out.agentId = value.agentId;
  }
  return out;
}

/**
 * What BB itself would start a chat with here — the project's remembered
 * choice, or the catalog default when it has none. Fields stay nullable: this
 * is a picture of somebody else's state, not our own record.
 */
export const executionFallbackSchema = z.object({
  providerId: z.string(),
  model: z.string(),
  reasoningLevel: z.enum(REASONING_LEVELS).nullable(),
  serviceTier: z.enum(SERVICE_TIERS).nullable(),
  permissionMode: z.enum(PERMISSION_MODES).nullable(),
});
export type ExecutionFallback = z.infer<typeof executionFallbackSchema>;

export const agentCatalogSchema = z.object({
  /** The CLI Agents plugin is installed and running on this server. */
  installed: z.boolean(),
  /** This provider has native session agents CLI Agents can bind. */
  supported: z.boolean(),
  agents: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      source: z.string(),
      mode: z.string(),
    }),
  ),
  /** Why the list is empty, in the words of the machine that answered. */
  error: z.string().nullable(),
});
export type AgentCatalog = z.infer<typeof agentCatalogSchema>;

export const isAgentProvider = (providerId: string) =>
  (AGENT_PROVIDERS as readonly string[]).includes(providerId);

/**
 * The copy a new chat should open: the pinned host when this place has a
 * folder there, otherwise the place's home host.
 */
export function placeOnHost(
  pinnedHostId: string | null | undefined,
  home: { hostId: string; path: string },
  copies: readonly { hostId: string; path: string }[],
): { hostId: string; path: string } {
  if (!pinnedHostId) return home;
  return copies.find((c) => c.hostId === pinnedHostId) ?? home;
}

/** Isolated managed worktree on this device; BB picks the default base branch. */
export const managedWorktreeEnvironment = (hostId: string) => ({
  type: "host" as const,
  hostId,
  workspace: {
    type: "managed-worktree" as const,
    baseBranch: { kind: "default" as const },
  },
});

/** The marker CLI Agents reads from the first message to bind one chat. */
export const agentMarker = (token: string) => `[cli-agents-selection:${token}]`;
export const AGENT_MARKER_PATTERN = /\[cli-agents-selection:[0-9a-f-]{36}\]/;
