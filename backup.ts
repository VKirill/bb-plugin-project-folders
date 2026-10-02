import { z } from "zod";
import type Database from "better-sqlite3";

export const BACKUP_KIND = "bb-project-folders-backup";
export const BACKUP_VERSION = 1;

export const DURABLE_TABLES = [
  "folders",
  "folder_paths",
  "thread_places",
  "folder_rules",
  "project_rules",
  "project_order",
  "execution_defaults",
  "session_policies",
  "preferences",
  "item_styles",
  "folder_archives",
] as const;
export type DurableTable = (typeof DURABLE_TABLES)[number];

export const TRANSIENT_TABLES = [
  "exports",
  "pending_exports",
  "project_moves",
  "thread_moves",
  "section_moves",
] as const;

const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const rowSchema = z.record(z.string(), cellSchema);
const tableRowsSchema = z.array(rowSchema);

export const backupTablesSchema = z.object({
  folders: tableRowsSchema,
  folder_paths: tableRowsSchema,
  thread_places: tableRowsSchema,
  folder_rules: tableRowsSchema,
  project_rules: tableRowsSchema,
  project_order: tableRowsSchema,
  execution_defaults: tableRowsSchema,
  session_policies: tableRowsSchema,
  preferences: tableRowsSchema,
  item_styles: tableRowsSchema,
  folder_archives: tableRowsSchema,
});

export const backupPayloadSchema = z.object({
  kind: z.literal(BACKUP_KIND),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.number(),
  pluginVersion: z.string().min(1),
  settings: z.record(z.string(), z.json()),
  tables: backupTablesSchema,
});
export type BackupPayload = z.infer<typeof backupPayloadSchema>;

export const backupImportModeSchema = z.enum(["replace", "merge"]);
export type BackupImportMode = z.infer<typeof backupImportModeSchema>;

export const backupImportResultSchema = z.object({
  folders: z.number().int(),
  folder_paths: z.number().int(),
  thread_places: z.number().int(),
  folder_rules: z.number().int(),
  project_rules: z.number().int(),
  project_order: z.number().int(),
  execution_defaults: z.number().int(),
  session_policies: z.number().int(),
  preferences: z.number().int(),
  item_styles: z.number().int(),
  folder_archives: z.number().int(),
  settingsNotRestored: z.boolean().optional(),
});
export type BackupImportResult = z.infer<typeof backupImportResultSchema>;

export function parseBackup(value: unknown): BackupPayload {
  const parsed = backupPayloadSchema.safeParse(value);
  if (!parsed.success)
    throw new Error("Not a Projects & Sections backup file.");
  return parsed.data;
}

function tableColumns(db: Database.Database, table: DurableTable): string[] {
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  ).map((r) => r.name);
}

function asRow(value: unknown): Record<string, string | number | boolean | null> {
  return rowSchema.parse(value);
}

export function exportTables(
  db: Database.Database,
): z.infer<typeof backupTablesSchema> {
  const tables = {} as Record<DurableTable, Record<string, unknown>[]>;
  for (const table of DURABLE_TABLES)
    tables[table] = (
      db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
    ).map(asRow);
  return backupTablesSchema.parse(tables);
}

export function importBusyReason(db: Database.Database): string | null {
  for (const row of db.prepare("SELECT data FROM project_moves").all() as {
    data: string;
  }[]) {
    try {
      if (!(JSON.parse(row.data) as { complete?: boolean }).complete)
        return "Finish pending project moves first.";
    } catch {
      return "Finish pending project moves first.";
    }
  }
  if (db.prepare("SELECT 1 FROM thread_moves LIMIT 1").get())
    return "Finish pending chat moves first.";
  for (const row of db.prepare("SELECT data FROM section_moves").all() as {
    data: string;
  }[]) {
    try {
      if (!(JSON.parse(row.data) as { complete?: boolean }).complete)
        return "Finish pending section moves first.";
    } catch {
      return "Finish pending section moves first.";
    }
  }
  for (const row of db.prepare("SELECT data FROM folder_archives").all() as {
    data: string;
  }[]) {
    try {
      const state = (JSON.parse(row.data) as { state?: string }).state;
      if (state && state !== "archived")
        return "Finish pending archive operations first.";
    } catch {
      return "Finish pending archive operations first.";
    }
  }
  return null;
}

function insertRow(
  db: Database.Database,
  table: DurableTable,
  columns: string[],
  row: Record<string, string | number | boolean | null>,
  replace: boolean,
) {
  const cols = columns.filter((c) => Object.hasOwn(row, c));
  if (!cols.length)
    throw new Error(`Backup row for ${table} has no known columns.`);
  const placeholders = cols.map(() => "?").join(",");
  const sql = replace
    ? `INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`
    : `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;
  db.prepare(sql).run(...cols.map((c) => row[c] ?? null));
}

export function importTables(
  db: Database.Database,
  tables: z.infer<typeof backupTablesSchema>,
  mode: BackupImportMode,
): Omit<BackupImportResult, "settingsNotRestored"> {
  const busy = importBusyReason(db);
  if (busy) throw new Error(busy);
  const counts = {
    folders: 0,
    folder_paths: 0,
    thread_places: 0,
    folder_rules: 0,
    project_rules: 0,
    project_order: 0,
    execution_defaults: 0,
    session_policies: 0,
    preferences: 0,
    item_styles: 0,
    folder_archives: 0,
  };
  db.transaction(() => {
    if (mode === "replace")
      for (const table of [...DURABLE_TABLES].reverse())
        db.prepare(`DELETE FROM ${table}`).run();
    for (const table of DURABLE_TABLES) {
      const columns = tableColumns(db, table);
      const rows = tables[table];
      for (const row of rows)
        insertRow(db, table, columns, asRow(row), mode === "merge");
      counts[table] = rows.length;
    }
  })();
  return counts;
}
