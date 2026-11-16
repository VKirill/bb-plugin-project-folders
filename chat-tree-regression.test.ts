import { expect, it } from "vitest";
import { sortChats } from "./chat-list";
import { branchSummary, buildChatTree } from "./chat-tree";

const chat = (
  id: string,
  parentThreadId: string | null = null,
  extra = {},
) => ({
  id,
  parentThreadId,
  projectId: "p",
  title: id,
  titleFallback: null,
  isPinned: false,
  isArchived: false,
  isUnread: false,
  createdAt: 1,
  updatedAt: 1,
  latestAttentionAt: 0,
  lastReadAt: 1,
  indicator: "none",
  hasPendingInteraction: false,
  activity: {
    workflows: 0,
    backgroundAgents: 0,
    backgroundCommands: 0,
    planMode: 0,
    goals: 0,
  },
  ...extra,
});

it.each(["unread-success", "unread-error", "waiting-for-input"])(
  "does not describe %s in a folded branch as running work",
  (indicator) => {
    const [root] = buildChatTree([
      chat("parent"),
      chat("child", "parent", { indicator }),
    ]);
    expect(branchSummary(root!).busy).toBe(false);
  },
);

it("ranks an old parent by its newest child's activity", () => {
  const threads = [
    chat("other", null, { updatedAt: 20 }),
    chat("parent"),
    chat("child", "parent", { updatedAt: 30 }),
  ];
  const roots = buildChatTree(sortChats(threads, "activity", "en"));
  expect(roots.map((n) => n.thread.id)).toEqual(["parent", "other"]);
});

it("keeps a pinned descendant's branch ahead of unpinned roots", () => {
  const threads = [
    chat("other", null, { updatedAt: 20 }),
    chat("parent"),
    chat("child", "parent", { isPinned: true }),
  ];
  const roots = buildChatTree(sortChats(threads, "activity", "en"));
  expect(roots.map((n) => n.thread.id)).toEqual(["parent", "other"]);
});
