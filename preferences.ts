import { z } from "zod";

/**
 * Plugin preferences shared by every device: the chat list, the tree view and
 * the appearance of projects and sections. Stored on the BB server, so the
 * sidebar, the management page and the BB settings page show the same values.
 */
export const CHAT_SORTS = ["activity", "title", "created"] as const;
export type ChatSort = (typeof CHAT_SORTS)[number];
export const COLOR_TOKENS = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "pink",
  "rose",
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];
/** Medium lightness reads on both light and dark themes. */
const COLOR_VALUES: Record<ColorToken, string> = {
  gray: "oklch(0.6 0.02 260)",
  red: "oklch(0.62 0.2 27)",
  orange: "oklch(0.68 0.17 50)",
  amber: "oklch(0.75 0.15 80)",
  green: "oklch(0.66 0.16 145)",
  teal: "oklch(0.66 0.11 185)",
  cyan: "oklch(0.7 0.12 215)",
  blue: "oklch(0.62 0.16 255)",
  indigo: "oklch(0.58 0.17 275)",
  violet: "oklch(0.6 0.18 300)",
  pink: "oklch(0.66 0.2 350)",
  rose: "oklch(0.64 0.2 10)",
};
export const FILLS = ["none", "badge", "stripe", "row"] as const;
export type Fill = (typeof FILLS)[number];
export const LEVELS = ["project", "level1", "level2", "level3"] as const;
export type LevelKey = (typeof LEVELS)[number];

const iconValue = z
  .string()
  .max(64)
  .regex(/^(icon:[A-Za-z0-9]{1,48}|emoji:.{1,16})$/u);
/** A plain pattern: RPC schemas travel as JSON Schema, where refinements are lost. */
const colorValue = z
  .string()
  .regex(new RegExp(`^(#[0-9a-fA-F]{6}|${COLOR_TOKENS.join("|")})$`));
export const styleSchema = z.object({
  icon: iconValue.optional(),
  color: colorValue.optional(),
  fill: z.enum(FILLS).optional(),
});
export type Style = z.infer<typeof styleSchema>;
export const itemStyleSchema = styleSchema.extend({
  /** Nested sections inherit this look unless they set their own. */
  cascade: z.boolean().optional(),
  sort: z.enum(CHAT_SORTS).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type ItemStyle = z.infer<typeof itemStyleSchema>;
export const prefsSchema = z.object({
  chatList: z.object({
    sort: z.enum(CHAT_SORTS),
    limit: z.number().int().min(1).max(100),
    sortSectionsByActivity: z.boolean(),
    autoCollapseInactive: z.boolean(),
    inactiveHours: z.number().min(0.25).max(720),
    inactiveUnit: z.enum(["hours", "days"]),
    hideIdleHours: z.number().min(0).max(720),
    boldUnread: z.boolean(),
    threadDisplay: z.enum(["classic", "provider-status"]),
  }),
  view: z.object({
    density: z.enum(["comfortable", "compact"]),
    indent: z.number().int().min(0).max(32),
  }),
  appearance: z.object({
    colorBy: z.enum(["level", "project"]),
    levels: z.object({
      project: styleSchema,
      level1: styleSchema,
      level2: styleSchema,
      level3: styleSchema,
    }),
  }),
});
export type Prefs = z.infer<typeof prefsSchema>;
export type ItemStyles = Record<string, ItemStyle>;

export const defaultPrefs: Prefs = {
  chatList: {
    sort: "activity",
    limit: 10,
    sortSectionsByActivity: true,
    autoCollapseInactive: true,
    inactiveHours: 2,
    inactiveUnit: "hours",
    hideIdleHours: 48,
    boldUnread: true,
    threadDisplay: "classic",
  },
  view: { density: "comfortable", indent: 8 },
  appearance: {
    colorBy: "level",
    levels: {
      project: { icon: "icon:Folder", fill: "none" },
      level1: { icon: "icon:Folder", fill: "none" },
      level2: { icon: "icon:Folder", fill: "none" },
      level3: { icon: "icon:Folder", fill: "none" },
    },
  },
};

export const PRESETS = ["standard", "mono", "levels", "projects"] as const;
export type Preset = (typeof PRESETS)[number];
export function presetAppearance(preset: Preset): Prefs["appearance"] {
  switch (preset) {
    case "standard":
      return structuredClone(defaultPrefs.appearance);
    case "mono":
      return {
        colorBy: "level",
        levels: {
          project: { icon: "icon:Briefcase", color: "gray", fill: "badge" },
          level1: { icon: "icon:Folder", color: "gray", fill: "none" },
          level2: { icon: "icon:FolderOpen", color: "gray", fill: "none" },
          level3: { icon: "icon:Layers", color: "gray", fill: "none" },
        },
      };
    case "levels":
      return {
        colorBy: "level",
        levels: {
          project: { icon: "icon:Briefcase", color: "blue", fill: "badge" },
          level1: { icon: "icon:Folder", color: "violet", fill: "none" },
          level2: { icon: "icon:FolderOpen", color: "teal", fill: "none" },
          level3: { icon: "icon:Layers", color: "amber", fill: "none" },
        },
      };
    case "projects":
      return {
        colorBy: "project",
        levels: {
          project: { icon: "icon:Briefcase", fill: "badge" },
          level1: { icon: "icon:Folder", fill: "stripe" },
          level2: { icon: "icon:FolderOpen", fill: "none" },
          level3: { icon: "icon:Layers", fill: "none" },
        },
      };
  }
}

const merge = <T extends object>(base: T, patch: unknown): T => {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    // Unknown keys are kept here and stripped by the schema; optional fields
    // such as a level color have no default to merge into.
    const cur = out[k];
    out[k] =
      cur && typeof cur === "object" && !Array.isArray(cur)
        ? merge(cur as object, v)
        : v;
  }
  return out as T;
};
/** Accepts partial or stale data; anything invalid falls back field by field. */
export function parsePrefs(value: unknown): Prefs {
  const merged = merge(structuredClone(defaultPrefs), value);
  const full = prefsSchema.safeParse(merged);
  if (full.success) return full.data;
  const out = structuredClone(defaultPrefs) as Record<string, any>;
  for (const [group, fields] of Object.entries(merged)) {
    if (!(group in out) || !fields || typeof fields !== "object") continue;
    for (const [field, v] of Object.entries(fields as object)) {
      const candidate = structuredClone(out);
      candidate[group][field] = v;
      if (prefsSchema.safeParse(candidate).success) out[group][field] = v;
    }
  }
  const levels = out.appearance.levels;
  for (const level of LEVELS) {
    const own = (merged.appearance.levels as Record<string, Style>)[level];
    const style: Style = { ...defaultPrefs.appearance.levels[level] };
    for (const key of ["icon", "color", "fill"] as const) {
      if (
        own?.[key] !== undefined &&
        styleSchema.shape[key].safeParse(own[key]).success
      )
        (style as Record<string, unknown>)[key] = own[key];
    }
    levels[level] = style;
  }
  return out as Prefs;
}
export function parseItemStyles(value: unknown): ItemStyles {
  const out: ItemStyles = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, style] of Object.entries(value)) {
    const parsed = itemStyleSchema.safeParse(style);
    if (
      /^[pf]:.{1,200}$/.test(key) &&
      parsed.success &&
      !isEmptyItem(parsed.data)
    )
      out[key] = parsed.data;
  }
  return out;
}
export const isEmptyItem = (s: ItemStyle) =>
  Object.values(s).every((v) => v === undefined);

export const projectKey = (projectId: string) => `p:${projectId}`;
export const folderKey = (folderId: string) => `f:${folderId}`;
export const levelKey = (level: number): LevelKey =>
  level <= 0
    ? "project"
    : level === 1
      ? "level1"
      : level === 2
        ? "level2"
        : "level3";

export function colorCss(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (color.startsWith("#"))
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined;
  return COLOR_VALUES[color as ColorToken];
}
/** A stable palette color per project when the look is colored by project. */
export function projectColor(projectId: string): ColorToken {
  let hash = 0;
  for (const ch of projectId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const palette = COLOR_TOKENS.filter((c) => c !== "gray");
  return palette[Math.abs(hash) % palette.length]!;
}

export type ResolvedStyle = {
  icon: string;
  color?: string;
  fill: Fill;
  sort: ChatSort;
  limit: number;
};
type TreeFolder = {
  id: string;
  parentId: string | null;
  projectId: string;
  kind?: string;
};
/** Groups arrange the tree without a folder; they get their own default icon. */
export const GROUP_ICON = "icon:FolderLibrary";
/**
 * Effective look of a project root (folder null) or a section. The nearest
 * value wins: the item itself, then ancestors marked "apply to nested", then
 * the project color in project mode, then the level defaults.
 */
export function resolveStyle(input: {
  prefs: Prefs;
  items: ItemStyles;
  folders: readonly TreeFolder[];
  projectId: string;
  folder: TreeFolder | null;
}): ResolvedStyle & { level: number } {
  const { prefs, items, folders, projectId, folder } = input;
  const chain: string[] = [];
  const visited = new Set<string>();
  let sections = 0;
  let cur: TreeFolder | undefined = folder ?? undefined;
  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    chain.push(folderKey(cur.id));
    if (cur.kind !== "group") sections++;
    const parentId: string | null = cur.parentId;
    cur = parentId ? folders.find((f) => f.id === parentId) : undefined;
  }
  // Groups do not count as levels; a group looks like a section in its place.
  const group = folder?.kind === "group";
  const level = group ? sections + 1 : sections;
  chain.push(projectKey(projectId));
  const base = prefs.appearance.levels[levelKey(level)];
  const out: ResolvedStyle = {
    icon: base.icon ?? "icon:Folder",
    color: base.color,
    fill: base.fill ?? "none",
    sort: prefs.chatList.sort,
    limit: prefs.chatList.limit,
  };
  if (group) out.icon = GROUP_ICON;
  if (prefs.appearance.colorBy === "project")
    out.color = items[projectKey(projectId)]?.color ?? projectColor(projectId);
  // From the project down to the item: later (nearer) values win.
  for (let i = chain.length - 1; i >= 0; i--) {
    const item = items[chain[i]!];
    if (!item || (i > 0 && !item.cascade)) continue;
    if (item.icon !== undefined) out.icon = item.icon;
    if (item.color !== undefined) out.color = item.color;
    if (item.fill !== undefined) out.fill = item.fill;
    if (item.sort !== undefined) out.sort = item.sort;
    if (item.limit !== undefined) out.limit = item.limit;
  }
  return { ...out, level };
}

export const EXPORT_KIND = "bb-project-folders-preferences";
export function exportPayload(prefs: Prefs, items: ItemStyles) {
  return { kind: EXPORT_KIND, version: 1, prefs, items };
}
export function parseImport(text: string): { prefs: Prefs; items: ItemStyles } {
  const data = JSON.parse(text);
  if (data?.kind !== EXPORT_KIND)
    throw new Error("Not a Projects & Sections settings file.");
  return { prefs: parsePrefs(data.prefs), items: parseItemStyles(data.items) };
}
