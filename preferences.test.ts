import { describe, it, expect } from "vitest";
import {
  defaultPrefs,
  prefsSchema,
  startingFolderSchema,
  exportPayload,
  parseImport,
  parseItemStyles,
  parsePrefs,
  presetAppearance,
  projectColor,
  resolveStyle,
} from "./preferences";
import { firstEmoji } from "./appearance";

const folders = [
  { id: "a", parentId: null, projectId: "p" },
  { id: "b", parentId: "a", projectId: "p" },
  { id: "c", parentId: "b", projectId: "p" },
  { id: "d", parentId: "c", projectId: "p" },
];
const look = (prefs = defaultPrefs, items = {}, id: string | null = null) =>
  resolveStyle({
    prefs,
    items,
    folders,
    projectId: "p",
    folder: id ? folders.find((f) => f.id === id)! : null,
  });

describe("preferences", () => {
  it("defaults older preferences and exports to the home folder", () => {
    const { projects, ...legacy } = defaultPrefs;
    expect(parsePrefs(legacy).projects).toEqual(projects);
    expect(prefsSchema.parse(legacy).projects).toEqual(projects);
    expect(
      parseImport(
        JSON.stringify(exportPayload(legacy as typeof defaultPrefs, {})),
      ).prefs.projects,
    ).toEqual(projects);
  });

  it("preserves the starting folder across export and import, rejecting invalid paths", () => {
    const prefs = {
      ...defaultPrefs,
      projects: { startingFolder: "/work/My projects" },
    };
    expect(parsePrefs(prefs)).toEqual(prefs);
    expect(parseImport(JSON.stringify(exportPayload(prefs, {}))).prefs).toEqual(
      prefs,
    );
    for (const startingFolder of [
      "relative",
      "~/Projects",
      "/work\u0000bad",
      "/work\n",
      "/work\u007f",
      "/" + "a".repeat(4096),
    ]) {
      expect(startingFolderSchema.safeParse(startingFolder).success).toBe(
        false,
      );
      expect(
        parsePrefs({ projects: { startingFolder } }).projects.startingFolder,
      ).toBe("");
    }
    expect(startingFolderSchema.safeParse("").success).toBe(true);
    expect(startingFolderSchema.safeParse("/").success).toBe(true);
  });

  it("keeps valid fields and drops invalid ones one by one", () => {
    const prefs = parsePrefs({
      chatList: { sort: "title", limit: 500, inactiveHours: 6 },
      view: { density: "compact" },
      appearance: {
        levels: { level1: { icon: "icon:Rocket", color: "nope", fill: "row" } },
      },
    });
    expect(prefs.chatList.sort).toBe("title");
    expect(prefs.chatList.limit).toBe(10);
    expect(prefs.chatList.inactiveHours).toBe(6);
    expect(prefs.chatList.sortSectionsByActivity).toBe(true);
    expect(prefs.chatList.inactiveUnit).toBe("hours");
    expect(prefs.chatList.hideIdleHours).toBe(48);
    expect(prefs.view.density).toBe("compact");
    expect(prefs.appearance.levels.level1).toEqual({
      icon: "icon:Rocket",
      fill: "row",
    });
    expect(parsePrefs("garbage")).toEqual(defaultPrefs);
  });

  it("keeps every preset intact through a save and load round trip", () => {
    for (const preset of ["standard", "mono", "levels", "projects"] as const) {
      const prefs = { ...defaultPrefs, appearance: presetAppearance(preset) };
      expect(parsePrefs(JSON.parse(JSON.stringify(prefs)))).toEqual(prefs);
    }
    const custom = parsePrefs({
      appearance: {
        levels: { level2: { icon: "emoji:🚀", color: "#12ab34" } },
      },
    });
    expect(custom.appearance.levels.level2).toEqual({
      icon: "emoji:🚀",
      color: "#12ab34",
      fill: "none",
    });
  });

  it("uses level defaults, with level 3 covering deeper sections", () => {
    const prefs = { ...defaultPrefs, appearance: presetAppearance("levels") };
    expect(look(prefs).color).toBe("blue");
    expect(look(prefs, {}, "a")).toMatchObject({ color: "violet", level: 1 });
    expect(look(prefs, {}, "b").color).toBe("teal");
    expect(look(prefs, {}, "d")).toMatchObject({ color: "amber", level: 4 });
  });

  it("applies an ancestor look to nested sections only when it cascades", () => {
    const items = { "f:a": { icon: "emoji:🚀", color: "#ff0000" } };
    expect(look(defaultPrefs, items, "a").icon).toBe("emoji:🚀");
    expect(look(defaultPrefs, items, "b").icon).toBe("icon:Folder");
    const cascading = {
      "f:a": { icon: "emoji:🚀", color: "#ff0000", cascade: true, limit: 3 },
      "f:c": { color: "green" },
    };
    expect(look(defaultPrefs, cascading, "b")).toMatchObject({
      icon: "emoji:🚀",
      color: "#ff0000",
      limit: 3,
    });
    expect(look(defaultPrefs, cascading, "c").color).toBe("green");
    expect(look(defaultPrefs, cascading, "d").color).toBe("#ff0000");
  });

  it("skips groups when counting levels and gives them their own icon", () => {
    const tree = [
      { id: "g", parentId: null, projectId: "p", kind: "group" },
      { id: "s", parentId: "g", projectId: "p" },
      { id: "t", parentId: "s", projectId: "p" },
    ];
    const prefs = { ...defaultPrefs, appearance: presetAppearance("levels") };
    const at = (id: string) =>
      resolveStyle({
        prefs,
        items: {},
        folders: tree,
        projectId: "p",
        folder: tree.find((f) => f.id === id)!,
      });
    expect(at("g")).toMatchObject({ level: 1, icon: "icon:FolderLibrary" });
    expect(at("s")).toMatchObject({ level: 1, color: "violet" });
    expect(at("t")).toMatchObject({ level: 2, color: "teal" });
  });

  it("colors a whole project in project mode", () => {
    const prefs = { ...defaultPrefs, appearance: presetAppearance("projects") };
    expect(look(prefs, {}, "c").color).toBe(projectColor("p"));
    expect(look(prefs, { "p:p": { color: "pink" } }, "c").color).toBe("pink");
  });

  it("round-trips an export and rejects foreign files", () => {
    const items = parseItemStyles({
      "f:a": { icon: "icon:Code" },
      "x:bad": { icon: "icon:Code" },
      "f:empty": {},
    });
    expect(Object.keys(items)).toEqual(["f:a"]);
    const text = JSON.stringify(exportPayload(defaultPrefs, items));
    expect(parseImport(text)).toEqual({ prefs: defaultPrefs, items });
    expect(() => parseImport("{}")).toThrow();
  });

  it("accepts only emoji as custom glyphs", () => {
    expect(firstEmoji("🚀 launch")).toBe("🚀");
    expect(firstEmoji("👨‍👩‍👧")).toBe("👨‍👩‍👧");
    expect(firstEmoji("abc")).toBeNull();
    expect(firstEmoji("")).toBeNull();
  });
});
