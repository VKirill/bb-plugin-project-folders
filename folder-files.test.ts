import { afterEach, expect, it } from "vitest";
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  rm,
  symlink,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { editFolder } from "./folder-files";
const roots: string[] = [];
async function root() {
  const p = await mkdtemp(path.join(tmpdir(), "bb-folders-"));
  roots.push(p);
  return p;
}
afterEach(async () => {
  for (const p of roots.splice(0))
    await rm(p, { recursive: true, force: true });
});
it("creates and deletes an empty directory without replacing existing folders", async () => {
  const parent = await root();
  await editFolder({ parent, name: "Child", action: "create" });
  await expect(
    editFolder({ parent, name: "Child", action: "create" }),
  ).rejects.toThrow();
  await editFolder({ parent, name: "Child", action: "delete" });
  await expect(stat(path.join(parent, "Child"))).rejects.toThrow();
});
it("preserves all files and rejects traversal and symlinks", async () => {
  const parent = await root();
  const child = path.join(parent, "Child");
  await mkdir(child);
  await writeFile(path.join(child, ".hidden"), "keep");
  await expect(
    editFolder({ parent, name: "Child", action: "delete" }),
  ).rejects.toThrow();
  expect(await readFile(path.join(child, ".hidden"), "utf8")).toBe("keep");
  for (const name of ["..", "../escape", "a/b", "a\\b", ""])
    await expect(
      editFolder({ parent, name, action: "create" }),
    ).rejects.toThrow();
  await symlink(child, path.join(parent, "Link"));
  await expect(
    editFolder({ parent, name: "Link", action: "delete" }),
  ).rejects.toThrow();
});
it("protects registered folders even through a parent alias", async () => {
  const parent = await root();
  const alias = parent + "-alias";
  roots.push(alias);
  await symlink(parent, alias);
  await mkdir(path.join(parent, "Project"));
  await expect(
    editFolder({
      parent: alias,
      name: "Project",
      action: "delete",
      protectedPaths: [path.join(parent, "Project")],
    }),
  ).rejects.toThrow("belongs to a project");
  expect((await stat(path.join(parent, "Project"))).isDirectory()).toBe(true);
});
it("explains a duplicate folder name, a missing parent and a full folder in plain words", async () => {
  const parent = await root();
  await mkdir(path.join(parent, "Same"));
  await expect(
    editFolder({ parent, name: "Same", action: "create" }),
  ).rejects.toThrow(
    /A folder named “Same” already exists in “.+”\. Choose another name\./,
  );
  await expect(
    editFolder({
      parent: path.join(parent, "gone"),
      name: "X",
      action: "create",
    }),
  ).rejects.toThrow(/gone.*was not found/);
  await writeFile(path.join(parent, "Same", "f"), "x");
  await expect(
    editFolder({ parent, name: "Same", action: "delete" }),
  ).rejects.toThrow(/is not empty/);
});
