import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import {
  BACKUP_KIND,
  DURABLE_TABLES,
  TRANSIENT_TABLES,
  parseBackup,
} from "./backup";
import { defaultPrefs } from "./preferences";

const root = {
  id: "p1",
  name: "Test",
  sources: [
    { type: "local_path", hostId: "h1", path: "/work", isDefault: true },
  ],
};

async function setup() {
  const h = createFakePluginHost({
    pluginId: "project-folders",
    agentSkillIds: ["project-folders"],
    sdk: {
      projects: { list: async () => [root] as never },
      hosts: {
        list: async () =>
          [{ id: "h1", name: "Mac", status: "connected" }] as never,
      },
      files: {
        mkdir: async () => ({}) as never,
        read: async () => {
          throw new Error("ENOENT: no such file or directory");
        },
        write: async () => ({ outcome: "written", sha256: "sha", sizeBytes: 1 }),
      },
      environments: { list: async () => [] },
    },
  });
  await plugin(h.bb);
  return h;
}

describe("backup payload", () => {
  it("rejects files that are not a plugin backup", () => {
    expect(() => parseBackup({})).toThrow(/backup/i);
    expect(() =>
      parseBackup({
        kind: "bb-project-folders-preferences",
        version: 1,
        prefs: defaultPrefs,
        items: {},
      }),
    ).toThrow(/backup/i);
  });
});

describe("full backup export and import", () => {
  it("round-trips every durable table with original ids", async () => {
    const h = await setup();
    try {
      const call = h.harness.behavior.callRpc;
      const db = h.bb.storage.database();
      const section = (await call("create", {
        projectId: "p1",
        folderId: null,
        name: "Docs",
        relativePath: "Docs",
      })) as { id: string };
      db.prepare("INSERT OR REPLACE INTO thread_places VALUES (?,?,?)").run(
        "t1",
        "p1",
        section.id,
      );
      await call("rules_settings_save", {
        projectId: "p1",
        folderId: section.id,
        mode: "custom",
        sectionTemplate: "# Section rules",
        custom: "Be brief.",
        customTarget: "session",
        startup: "Status first.",
      });
      await call("rules_settings_save", {
        projectId: "p1",
        folderId: null,
        mode: "custom",
        sectionTemplate: "# Nested",
        projectTemplate: "# Project rules",
        custom: "Project custom",
        customTarget: "file",
        startup: "Read the registry.",
      });
      await call("reorder", { kind: "projects", ids: ["p1"] });
      await call("execution_save", {
        scope: { kind: "global" },
        value: { providerId: "codex", model: "gpt-6" },
      });
      await call("session_policy_save", {
        scope: { kind: "global" },
        value: { userInstructions: false },
      });
      await call("prefs_save", {
        prefs: { ...defaultPrefs, chatList: { ...defaultPrefs.chatList, limit: 7 } },
      });
      await call("item_style_save", {
        key: `f:${section.id}`,
        style: { icon: "icon:Code" },
      });
      await call("agents_config_save", {
        autoCreate: false,
        template: "# Shared sections",
        projectTemplate: "# Shared project",
        custom: "",
        customTarget: "file",
        startup: "",
      });
      db.prepare("INSERT INTO folder_archives VALUES (?,?,?)").run(
        "arch-1",
        1_700_000_000_000,
        JSON.stringify({ id: "arch-1", folder: { id: section.id } }),
      );
      db.prepare("INSERT OR REPLACE INTO exports VALUES (?,?,NULL,?)").run(
        "tx",
        "/tmp/export",
        1,
      );
      db.prepare("INSERT OR IGNORE INTO pending_exports VALUES (?)").run("tx");

      const exported = parseBackup(await call("backup_export", null));
      expect(exported.kind).toBe(BACKUP_KIND);
      expect(exported.version).toBe(1);
      expect(exported.pluginVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(exported.settings).toEqual({});
      for (const table of DURABLE_TABLES)
        expect(exported.tables[table].length).toBeGreaterThan(0);
      for (const table of TRANSIENT_TABLES)
        expect(exported.tables).not.toHaveProperty(table);
      const originalId = exported.tables.folders.find(
        (row) => row.id === section.id,
      );
      expect(originalId).toMatchObject({
        id: section.id,
        name: "Docs",
        projectId: "p1",
      });

      for (const table of DURABLE_TABLES)
        db.prepare(`DELETE FROM ${table}`).run();
      expect(
        (db.prepare("SELECT id FROM folders").all() as { id: string }[]).length,
      ).toBe(0);
      expect(
        db.prepare("SELECT threadId FROM exports").get() as { threadId: string },
      ).toEqual({ threadId: "tx" });

      const restored = (await call("backup_import", {
        backup: exported,
        mode: "replace",
      })) as Record<string, number | boolean>;
      expect(restored.settingsNotRestored).toBeUndefined();
      for (const table of DURABLE_TABLES)
        expect(restored[table]).toBe(exported.tables[table].length);

      const again = parseBackup(await call("backup_export", null));
      expect(again.tables).toEqual(exported.tables);
      expect(
        (
          db
            .prepare("SELECT id FROM folders WHERE id=?")
            .get(section.id) as { id: string }
        ).id,
      ).toBe(section.id);
      const agents = (await call("agents_config", null)) as {
        autoCreate: boolean;
        template: string;
      };
      expect(agents.autoCreate).toBe(false);
      expect(agents.template).toContain("# Shared sections");
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });

  it("rejects an invalid backup and refuses import during an active move", async () => {
    const h = await setup();
    try {
      const call = h.harness.behavior.callRpc;
      await expect(
        call("backup_import", { backup: { kind: "nope" }, mode: "replace" }),
      ).rejects.toThrow(/backup/i);

      const db = h.bb.storage.database();
      db.prepare("INSERT OR REPLACE INTO project_moves VALUES (?,?)").run(
        "m1",
        JSON.stringify({
          id: "m1",
          projectId: "p1",
          hostId: "h1",
          sourceId: "s1",
          source: "/work",
          destination: "/other",
          complete: false,
          error: null,
        }),
      );
      const empty = parseBackup(await call("backup_export", null));
      await expect(
        call("backup_import", { backup: empty, mode: "replace" }),
      ).rejects.toThrow(/project moves/i);
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });

  it("merges rows without dropping locals and reports unrestored settings", async () => {
    const h = await setup();
    try {
      const call = h.harness.behavior.callRpc;
      const first = (await call("create", {
        projectId: "p1",
        folderId: null,
        name: "Alpha",
        relativePath: "Alpha",
      })) as { id: string };
      const snapshot = parseBackup(await call("backup_export", null));
      const second = (await call("create", {
        projectId: "p1",
        folderId: null,
        name: "Beta",
        relativePath: "Beta",
      })) as { id: string };
      const merged = (await call("backup_import", {
        backup: snapshot,
        mode: "merge",
      })) as { folders: number };
      expect(merged.folders).toBe(snapshot.tables.folders.length);
      const list = (await call("list", null)) as {
        folders: { id: string; name: string }[];
      };
      expect(list.folders.map((f) => f.id).sort()).toEqual(
        [first.id, second.id].sort(),
      );

      const withSettings = {
        ...snapshot,
        settings: { leftover: true },
      };
      const result = (await call("backup_import", {
        backup: withSettings,
        mode: "replace",
      })) as { settingsNotRestored?: boolean };
      expect(result.settingsNotRestored).toBe(true);
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });

  it("backs up and restores through the CLI without replacing archive restore", async () => {
    const h = await setup();
    const dir = mkdtempSync(path.join(tmpdir(), "pf-backup-"));
    const file = path.join(dir, "backup.json");
    try {
      const call = h.harness.behavior.callRpc;
      const run = (argv: string[]) =>
        h.harness.behavior.runCli(argv, { cwd: dir });
      const section = (await call("create", {
        projectId: "p1",
        folderId: null,
        name: "CLI",
        relativePath: "CLI",
      })) as { id: string };
      const backup = await run(["backup", "--out", "backup.json"]);
      expect(backup.exitCode).toBe(0);
      const saved = parseBackup(JSON.parse(readFileSync(file, "utf8")));
      expect(saved.tables.folders.some((row) => row.id === section.id)).toBe(
        true,
      );

      h.bb.storage.database().prepare("DELETE FROM folders").run();
      const restored = await run(["restore", "backup.json"]);
      expect(restored.exitCode).toBe(0);
      expect(
        (
          h.bb.storage
            .database()
            .prepare("SELECT id FROM folders WHERE id=?")
            .get(section.id) as { id: string }
        ).id,
      ).toBe(section.id);

      const mergeFile = path.join(dir, "merge.json");
      writeFileSync(mergeFile, JSON.stringify(saved));
      const merged = await run(["restore", "merge.json", "--merge"]);
      expect(merged.exitCode).toBe(0);

      const archive = await run(["restore", "missing-archive-id"]);
      expect(archive.exitCode).toBe(1);
      expect(archive.stderr).not.toMatch(/backup/i);
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
});
