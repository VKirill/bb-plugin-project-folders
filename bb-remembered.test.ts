import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import {
  bbDatabasePath,
  wantedRemembered,
  writeRemembered,
  type Remembered,
} from "./bb-remembered";

/** BB's own table, as its migrations create it. */
const BB_SCHEMA = `
CREATE TABLE projects (id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE project_execution_defaults (
  project_id text NOT NULL,
  provider_id text NOT NULL,
  model text NOT NULL,
  service_tier text NOT NULL,
  reasoning_level text NOT NULL,
  permission_mode text NOT NULL,
  updated_at integer NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX project_execution_defaults_project_idx ON project_execution_defaults (project_id);
`;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
/** A BB data directory with a WAL-mode bb.db holding projects p1 and p2. */
function bbDataDir(rows: [string, Remembered][] = []) {
  const dir = mkdtempSync(join(tmpdir(), "pf-bb-data-"));
  dirs.push(dir);
  const db = new Database(bbDatabasePath(dir));
  db.pragma("journal_mode = WAL");
  db.exec(BB_SCHEMA);
  db.exec("INSERT INTO projects (id) VALUES ('p1'), ('p2')");
  for (const [projectId, r] of rows)
    db.prepare(
      "INSERT INTO project_execution_defaults VALUES (?, ?, ?, ?, ?, ?, 1)",
    ).run(
      projectId,
      r.providerId,
      r.model,
      r.serviceTier,
      r.reasoningLevel,
      r.permissionMode,
    );
  db.close();
  return dir;
}
function rowOf(dir: string, projectId = "p1") {
  const db = new Database(bbDatabasePath(dir), { readonly: true });
  try {
    return db
      .prepare(
        "SELECT provider_id AS providerId, model, reasoning_level AS reasoningLevel, service_tier AS serviceTier, permission_mode AS permissionMode FROM project_execution_defaults WHERE project_id=?",
      )
      .get(projectId) as Remembered | undefined;
  } finally {
    db.close();
  }
}

const antigravity: Remembered = {
  providerId: "acp-antigravity",
  model: "gemini-3.8-flash",
  reasoningLevel: "high",
  serviceTier: "default",
  permissionMode: "full",
};
const opus = {
  providerId: "claude-code",
  model: "claude-opus-5-5",
  reasoningLevel: "high" as const,
  permissionMode: "full" as const,
};

describe("the row the plugin's project setting stands for", () => {
  const pin = (
    model: Partial<{
      providerId: string;
      model: string;
      reasoningLevel: "high" | null;
      serviceTier: "fast" | null;
    }> | null,
    permission?: "full" | "auto",
  ) => ({
    model: model
      ? {
          providerId: model.providerId ?? "claude-code",
          model: model.model ?? "claude-opus-5-5",
          reasoningLevel: model.reasoningLevel ?? null,
          serviceTier: model.serviceTier ?? null,
          origin: { scope: "project" as const, folderId: null },
        }
      : null,
    permissionMode: permission
      ? {
          value: permission,
          origin: { scope: "project" as const, folderId: null },
        }
      : null,
  });
  it("says nothing when the plugin pins nothing BB stores", () => {
    expect(wantedRemembered(pin(null), antigravity)).toBeNull();
    expect(wantedRemembered(pin(null, "full"), null)).toBeNull();
  });
  it("replaces another provider and fills what is not pinned with BB defaults", () => {
    expect(wantedRemembered(pin({}), antigravity)).toEqual({
      providerId: "claude-code",
      model: "claude-opus-5-5",
      reasoningLevel: "medium",
      serviceTier: "default",
      // The permission mode is not tied to a provider: BB's stays.
      permissionMode: "full",
    });
  });
  it("keeps BB's reasoning and tier when the provider stays the same", () => {
    expect(
      wantedRemembered(pin({ providerId: "acp-antigravity", model: "x" }), {
        ...antigravity,
        serviceTier: "fast",
      }),
    ).toMatchObject({ reasoningLevel: "high", serviceTier: "fast" });
  });
  it("changes only the permission mode when no provider is pinned", () => {
    expect(wantedRemembered(pin(null, "auto"), antigravity)).toEqual({
      ...antigravity,
      permissionMode: "auto",
    });
  });
});

describe("writing BB's remembered row", () => {
  const wanted: Remembered = {
    ...opus,
    serviceTier: "default",
  };
  it("updates the project's row and leaves other projects alone", () => {
    const dir = bbDataDir([
      ["p1", antigravity],
      ["p2", antigravity],
    ]);
    expect(
      writeRemembered(Database, bbDatabasePath(dir), "p1", wanted),
    ).toBe("written");
    expect(rowOf(dir)).toEqual(wanted);
    expect(rowOf(dir, "p2")).toEqual(antigravity);
    expect(
      writeRemembered(Database, bbDatabasePath(dir), "p1", wanted),
    ).toBe("unchanged");
  });
  it("inserts a row for a project BB has not remembered yet", () => {
    const dir = bbDataDir();
    writeRemembered(Database, bbDatabasePath(dir), "p2", wanted);
    expect(rowOf(dir, "p2")).toEqual(wanted);
  });
  it("writes while BB keeps its own connection open, and BB reads it at once", () => {
    const dir = bbDataDir([["p1", antigravity]]);
    const daemon = new Database(bbDatabasePath(dir));
    try {
      daemon.pragma("busy_timeout = 5000");
      const read = daemon.prepare(
        "SELECT provider_id FROM project_execution_defaults WHERE project_id='p1'",
      );
      expect(read.pluck().get()).toBe("acp-antigravity");
      writeRemembered(Database, bbDatabasePath(dir), "p1", wanted);
      expect(read.pluck().get()).toBe("claude-code");
      expect(daemon.pragma("journal_mode", { simple: true })).toBe("wal");
    } finally {
      daemon.close();
    }
  });
  it("refuses a project BB does not know and a table whose shape changed", () => {
    const dir = bbDataDir();
    expect(() =>
      writeRemembered(Database, bbDatabasePath(dir), "ghost", wanted),
    ).toThrow(/no project ghost/);
    const db = new Database(bbDatabasePath(dir));
    db.exec("ALTER TABLE project_execution_defaults DROP COLUMN service_tier");
    db.close();
    expect(() =>
      writeRemembered(Database, bbDatabasePath(dir), "p1", wanted),
    ).toThrow(/missing service_tier/);
    const check = new Database(bbDatabasePath(dir), { readonly: true });
    expect(
      check.prepare("SELECT count(*) FROM project_execution_defaults").pluck().get(),
    ).toBe(0);
    check.close();
  });
  it("never creates a database that is not there", () => {
    const dir = mkdtempSync(join(tmpdir(), "pf-bb-empty-"));
    dirs.push(dir);
    expect(() =>
      writeRemembered(Database, bbDatabasePath(dir), "p1", wanted),
    ).toThrow();
  });
});

const root = {
  id: "p1",
  name: "Test",
  sources: [
    { type: "local_path", hostId: "h1", path: "/work", isDefault: true },
  ],
};
async function setup(dataDir: string, live = ["claude-code", "codex"]) {
  const h = createFakePluginHost({
    pluginId: "project-folders",
    agentSkillIds: ["project-folders"],
    dataDir,
    sdk: {
      projects: {
        list: async () => [root] as never,
        // BB answers from its own database, so the round trip is real.
        defaultExecutionOptions: async ({ projectId }) =>
          (rowOf(dataDir, projectId) ?? null) as never,
      },
      providers: {
        list: async () =>
          ["claude-code", "codex", "acp-antigravity"].map((id) => ({
            id,
            available: live.includes(id),
          })) as never,
      },
      hosts: {
        list: async () =>
          [{ id: "h1", name: "Mac", status: "connected" }] as never,
      },
      files: {
        mkdir: async () => ({}) as never,
        read: async () => {
          throw new Error("ENOENT: no such file or directory");
        },
        write: async () => ({ outcome: "written", sha256: "s", sizeBytes: 1 }),
      },
      environments: { list: async () => [] },
      plugins: {
        list: async () => ({ plugins: [] }) as never,
      },
    },
  });
  await plugin(h.bb);
  return h;
}
const project = { kind: "project", projectId: "p1" } as const;

describe("project setting → BB's remembered defaults", () => {
  it("writes a project save into BB and reports it", async () => {
    const dir = bbDataDir([["p1", antigravity]]);
    const h = await setup(dir);
    try {
      const call = h.harness.behavior.callRpc;
      const before = (await call("execution_read", { scope: project })) as {
        bb: Record<string, unknown>;
      };
      expect(before.bb).toMatchObject({
        remembered: antigravity,
        rememberedAvailable: false,
        wanted: null,
        matches: true,
      });
      const saved = (await call("execution_save", {
        scope: project,
        value: opus,
      })) as { bb: unknown };
      expect(saved.bb).toEqual({
        status: "written",
        providerId: "claude-code",
        message: null,
      });
      expect(rowOf(dir)).toEqual({ ...opus, serviceTier: "default" });
      const after = (await call("execution_read", { scope: project })) as {
        bb: Record<string, unknown>;
      };
      expect(after.bb).toMatchObject({
        rememberedAvailable: true,
        wantedAvailable: true,
        matches: true,
      });
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("never writes a provider without a live bridge", async () => {
    const dir = bbDataDir([["p1", { ...antigravity, providerId: "codex", model: "gpt-6" }]]);
    const h = await setup(dir);
    try {
      const saved = (await h.harness.behavior.callRpc("execution_save", {
        scope: project,
        value: { providerId: "acp-antigravity", model: "gemini-3.8-flash" },
      })) as { bb: { status: string } };
      expect(saved.bb.status).toBe("unavailable");
      expect(rowOf(dir)?.providerId).toBe("codex");
      const read = (await h.harness.behavior.callRpc("execution_read", {
        scope: project,
      })) as { bb: Record<string, unknown> };
      expect(read.bb).toMatchObject({
        rememberedAvailable: true,
        wantedAvailable: false,
        matches: false,
      });
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("leaves BB alone for a section, shows the mismatch and writes on request", async () => {
    const dir = bbDataDir([["p1", antigravity]]);
    const h = await setup(dir);
    try {
      const call = h.harness.behavior.callRpc;
      const { id } = (await call("create", {
        projectId: "p1",
        folderId: null,
        name: "Site",
        relativePath: "Site",
      })) as { id: string };
      const sectionSave = (await call("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: { providerId: "codex", model: "gpt-6" },
      })) as { bb?: unknown };
      expect(sectionSave.bb).toBeUndefined();
      expect(rowOf(dir)).toEqual(antigravity);
      const folderRead = (await call("execution_read", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
      })) as { bb: unknown };
      expect(folderRead.bb).toBeNull();

      // The plugin-wide default does not write either, but the project now
      // inherits it, so the project page shows the mismatch.
      await call("execution_save", { scope: { kind: "global" }, value: opus });
      expect(rowOf(dir)).toEqual(antigravity);
      const read = (await call("execution_read", { scope: project })) as {
        bb: Record<string, unknown>;
      };
      expect(read.bb).toMatchObject({
        wanted: { providerId: "claude-code" },
        matches: false,
      });
      expect(await call("execution_remember", { projectId: "p1" })).toMatchObject({
        status: "written",
      });
      expect(rowOf(dir)?.providerId).toBe("claude-code");
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("reports a failure instead of failing the save when bb.db is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pf-bb-empty-"));
    dirs.push(dir);
    const h = await setup(dir);
    try {
      const saved = (await h.harness.behavior.callRpc("execution_save", {
        scope: project,
        value: opus,
      })) as { ok: boolean; bb: { status: string } };
      expect(saved.ok).toBe(true);
      expect(saved.bb.status).toBe("failed");
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
});
