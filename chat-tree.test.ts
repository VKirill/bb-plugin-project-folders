import { describe, expect, it } from "vitest";
import { sortChats } from "./chat-list";
import {
  ancestorsInTree,
  branchSummary,
  buildChatTree,
  descendantsOf,
  parseCollapsedChats,
  visibleChatRoots,
  type ChatNode,
  type TreeChat,
} from "./chat-tree";

type Chat = TreeChat & {
  title: string;
  titleFallback: null;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  latestAttentionAt: number;
};
const NOW = 1_000_000_000;
const HOUR = 3_600_000;
// A larger `age` means older: the default activity sort lists newer chats first.
const chat = (id: string, parent: string | null = null, extra = {}): Chat => ({
  id,
  title: id,
  titleFallback: null,
  projectId: "p",
  parentThreadId: parent,
  isPinned: false,
  isArchived: false,
  createdAt: NOW - HOUR,
  updatedAt: NOW - HOUR,
  latestAttentionAt: 0,
  lastReadAt: NOW - HOUR,
  ...extra,
});
const tree = (chats: Chat[]) => buildChatTree(sortChats(chats, "title", "en"));
const shape = (nodes: ChatNode<Chat>[]): unknown[] =>
  nodes.map((n) =>
    n.children.length ? { [n.thread.id]: shape(n.children) } : n.thread.id,
  );
const flat = (nodes: ChatNode<Chat>[]): string[] =>
  nodes.flatMap((n) => [n.thread.id, ...descendantsOf(n).map((t) => t.id)]);

describe("buildChatTree", () => {
  it("keeps chats without a parent as roots, in the group's order", () => {
    expect(shape(tree([chat("b"), chat("a"), chat("c")]))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("nests two levels and counts every descendant, not only children", () => {
    const [a] = tree([
      chat("a"),
      chat("a1", "a"),
      chat("a2", "a"),
      chat("a1x", "a1"),
      chat("a2x", "a2"),
    ]);
    expect(shape([a!])).toEqual([{ a: [{ a1: ["a1x"] }, { a2: ["a2x"] }] }]);
    expect(a!.children).toHaveLength(2);
    expect(a!.descendants).toBe(4);
    expect(a!.children[0]!.descendants).toBe(1);
  });

  it("orders each level on its own and keeps a pinned child inside its branch", () => {
    const roots = tree([
      chat("z", null, { isPinned: true }),
      chat("a"),
      chat("p"),
      chat("p-b", "p"),
      chat("p-a", "p"),
      chat("p-pin", "p", { isPinned: true }),
    ]);
    expect(shape(roots)).toEqual(["z", "a", { p: ["p-pin", "p-a", "p-b"] }]);
  });

  it("leaves a chat whose parent is outside the group, or missing, as a root", () => {
    expect(
      shape(tree([chat("orphan", "elsewhere"), chat("ok"), chat("kid", "ok")])),
    ).toEqual([{ ok: ["kid"] }, "orphan"]);
  });

  it("drops archived rows but keeps their active children reachable as roots", () => {
    const chats = [
      chat("old", null, { isArchived: true }),
      chat("kid", "old"),
      chat("grandkid", "kid"),
    ];
    expect(shape(tree(chats))).toEqual([{ kid: ["grandkid"] }]);
  });

  it("shows a chat that is its own parent once, as a root", () => {
    const roots = tree([chat("a", "a"), chat("b")]);
    expect(shape(roots)).toEqual(["a", "b"]);
    expect(roots[0]!.descendants).toBe(0);
  });

  it("breaks a two-chat cycle at the first chat in group order, each chat once", () => {
    const roots = tree([chat("b", "a"), chat("a", "b")]);
    expect(shape(roots)).toEqual([{ a: ["b"] }]);
    expect(flat(roots).sort()).toEqual(["a", "b"]);
    expect(roots[0]!.descendants).toBe(1);
  });

  it("keeps everything hanging from a cycle, and ordinary roots, in one pass", () => {
    const roots = tree([
      chat("a", "c"),
      chat("b", "a"),
      chat("c", "b"),
      chat("tail", "c"),
      chat("solo"),
    ]);
    expect(flat(roots).sort()).toEqual(["a", "b", "c", "solo", "tail"]);
    expect(new Set(flat(roots)).size).toBe(5);
    expect(roots.map((r) => r.thread.id)).toEqual(["a", "solo"]);
  });

  it("keeps a chat that hangs from a cycle under it, even when it sorts before the cycle", () => {
    const roots = tree([
      chat("a", "c"),
      chat("b", "a"),
      chat("c", "b"),
      chat("0tail", "c"),
      chat("solo"),
    ]);
    expect(shape(roots)).toEqual([{ a: [{ b: [{ c: ["0tail"] }] }] }, "solo"]);
  });

  it("roots a cycle at its member that sorts first, however deep the tails and whichever tail sorts first", () => {
    const roots = tree([
      chat("0deep", "0tail"),
      chat("0tail", "m"),
      chat("m", "z"),
      chat("z", "k"),
      chat("k", "m"),
    ]);
    // Each chat sits under its parent; the cycle m -> z -> k -> m is opened at
    // "k", the member that sorts first.
    expect(shape(roots)).toEqual([{ k: [{ z: [{ m: [{ "0tail": ["0deep"] }] }] }] }]);
    expect(flat(roots).sort()).toEqual(["0deep", "0tail", "k", "m", "z"]);
  });

  it("lists a repeated id once", () => {
    expect(
      flat(buildChatTree([chat("a"), chat("a"), chat("b", "a")])),
    ).toEqual(["a", "b"]);
  });

  it("builds a very deep chain without recursion limits", () => {
    const chats = Array.from({ length: 20_000 }, (_, i) =>
      chat(`c${i}`, i ? `c${i - 1}` : null),
    );
    const [root] = buildChatTree(chats);
    expect(root!.descendants).toBe(19_999);
    expect(descendantsOf(root!)).toHaveLength(19_999);
  });
});

describe("branchSummary", () => {
  it("counts all descendants and reports unread or busy work anywhere below", () => {
    const [a] = tree([
      chat("a", null, { isUnread: true, status: "active" }),
      chat("a1", "a"),
      chat("a1x", "a1", { isUnread: true }),
      chat("a2", "a", { indicator: "runtime" }),
    ]);
    expect(branchSummary(a!)).toEqual({ count: 3, unread: true, busy: true });
    const [quiet] = tree([
      chat("q", null, { isUnread: true, status: "active" }),
      chat("q1", "q"),
    ]);
    expect(branchSummary(quiet!)).toEqual({
      count: 1,
      unread: false,
      busy: false,
    });
  });
});

describe("visibleChatRoots", () => {
  const params = { expanded: false, limit: 10, hideIdleMs: 2 * HOUR, now: NOW };
  const ids = (nodes: ChatNode<Chat>[]) => nodes.map((n) => n.thread.id);
  const idle = {
    updatedAt: NOW - 5 * HOUR,
    createdAt: NOW - 5 * HOUR,
    lastReadAt: NOW - 5 * HOUR,
  };

  it("applies the limit to roots and never cuts a branch apart", () => {
    const roots = tree([
      chat("a"),
      chat("a1", "a"),
      chat("a2", "a"),
      chat("b"),
      chat("c"),
    ]);
    const shown = visibleChatRoots(roots, { ...params, limit: 2 });
    expect(ids(shown)).toEqual(["a", "b"]);
    expect(flat(shown)).toEqual(["a", "a1", "a2", "b"]);
  });

  it("returns every root once the list is expanded", () => {
    const roots = tree([chat("a"), chat("b"), chat("c")]);
    expect(ids(visibleChatRoots(roots, { ...params, limit: 1, expanded: true }))).toEqual(["a", "b", "c"]);
  });

  it("hides an idle root with idle descendants", () => {
    const roots = tree([
      chat("old", null, idle),
      chat("old1", "old", idle),
      chat("fresh"),
    ]);
    expect(ids(visibleChatRoots(roots, params))).toEqual(["fresh"]);
  });

  it.each([
    ["unread", { isUnread: true }],
    ["pinned", { isPinned: true }],
    ["busy", { indicator: "runtime" }],
  ])("keeps an idle root that has a %s child", (_name, extra) => {
    const roots = tree([
      chat("old", null, idle),
      chat("kid", "old", { ...idle, ...extra }),
    ]);
    expect(ids(visibleChatRoots(roots, params))).toEqual(["old"]);
  });

  it("keeps an idle root while its open descendant is on screen", () => {
    const roots = tree([
      chat("old", null, idle),
      chat("kid", "old", idle),
      chat("grandkid", "kid", idle),
    ]);
    expect(ids(visibleChatRoots(roots, params))).toEqual([]);
    expect(
      ids(visibleChatRoots(roots, { ...params, activeThreadId: "grandkid" })),
    ).toEqual(["old"]);
  });

  it("lets a root with an important child through past the limit, but not an important root", () => {
    const roots = tree([
      chat("a"),
      chat("b", null, { isUnread: true }),
      chat("c"),
      chat("c1", "c", { isUnread: true }),
      chat("d"),
      chat("d1", "d", { updatedAt: NOW - 1 }),
    ]);
    expect(ids(visibleChatRoots(roots, { ...params, limit: 1 }))).toEqual([
      "a",
      "c",
    ]);
  });

  it("lets a root with a pinned child through past the limit", () => {
    const roots = tree([
      chat("a"),
      chat("b"),
      chat("b1", "b", { isPinned: true }),
      chat("c"),
      chat("c1", "c"),
    ]);
    expect(ids(visibleChatRoots(roots, { ...params, limit: 1 }))).toEqual([
      "a",
      "b",
    ]);
  });

  it("keeps the flat behavior for chats without children", () => {
    const roots = tree([
      chat("a", null, { isUnread: true }),
      chat("b", null, { isUnread: true }),
    ]);
    expect(ids(visibleChatRoots(roots, { ...params, limit: 1 }))).toEqual(["a"]);
  });
});

describe("ancestorsInTree", () => {
  it("returns the parents as drawn, nearest first, and null for a chat not in the tree", () => {
    const roots = tree([chat("a"), chat("b", "a"), chat("c", "b"), chat("z")]);
    expect(ancestorsInTree(roots, "c")).toEqual(["b", "a"]);
    expect(ancestorsInTree(roots, "a")).toEqual([]);
    expect(ancestorsInTree(roots, "z")).toEqual([]);
    expect(ancestorsInTree(roots, "unknown")).toBeNull();
  });

  it("does not look through a parent that is not drawn above the chat", () => {
    // The archived middle parent is gone from the group, so "kid" is a root.
    const roots = tree([
      chat("grand"),
      chat("old", "grand", { isArchived: true }),
      chat("kid", "old"),
    ]);
    expect(ancestorsInTree(roots, "kid")).toEqual([]);
  });

  it("follows the cycle as drawn: the head has no parent, the rest hang below it", () => {
    const roots = tree([chat("a", "b"), chat("b", "a")]);
    expect(ancestorsInTree(roots, "a")).toEqual([]);
    expect(ancestorsInTree(roots, "b")).toEqual(["a"]);
  });

  it("walks a very deep chain", () => {
    const chats = Array.from({ length: 20_000 }, (_, i) =>
      chat(`c${i}`, i ? `c${i - 1}` : null),
    );
    expect(ancestorsInTree(buildChatTree(chats), "c19999")).toHaveLength(19_999);
  });
});

describe("parseCollapsedChats", () => {
  it("reads a list of ids and ignores malformed storage", () => {
    expect([...parseCollapsedChats('["a","b"]')]).toEqual(["a", "b"]);
    expect([...parseCollapsedChats('["a",3,null]')]).toEqual(["a"]);
    for (const raw of [null, "", "{", '{"a":true}', "5"])
      expect(parseCollapsedChats(raw).size).toBe(0);
  });
});
