import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readPluginVersion } from "./server";

let root = "";
afterEach(() => root && rmSync(root, { recursive: true, force: true }));
const bundle = (files: Record<string, string>) => {
  root = mkdtempSync(join(tmpdir(), "pf-version-"));
  mkdirSync(join(root, "dist"));
  for (const [path, text] of Object.entries(files))
    writeFileSync(join(root, path), text);
  return pathToFileURL(join(root, "dist", "server.js"));
};

describe("the plugin version the server bundle reads", () => {
  it("reads dist/package.json where BB copied it", () => {
    const from = bundle({ "dist/package.json": '{"version":"1.2.3"}' });
    expect(readPluginVersion(from)).toBe("1.2.3");
  });
  it("falls back to the plugin root on BB 0.43, which copies nothing", () => {
    const from = bundle({ "package.json": '{"version":"1.2.4"}' });
    expect(readPluginVersion(from)).toBe("1.2.4");
  });
  it("never throws when neither file is there", () => {
    expect(readPluginVersion(bundle({}))).toBe("unknown");
  });
});
