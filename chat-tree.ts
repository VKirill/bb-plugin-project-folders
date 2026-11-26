import {
  isChatKeptVisible,
  isThreadBusy,
  type ChatSort,
  type ChatThread,
} from "./chat-list";
import { threadStatus } from "./thread-status";

export type TreeChat = ChatThread & { parentThreadId?: string | null };

export type ChatNode<T extends TreeChat> = {
  thread: T;
  children: ChatNode<T>[];
  /** Every chat below this one, at any depth. */
  descendants: number;
  pinned: boolean;
  activity: number;
};

/**
 * Hangs the chats of one displayed group under their parents.
 *
 * `sorted` is the group's own order (archived rows already dropped), and it
 * orders the siblings of every level. A chat whose parent is not in the group
 * stays a root. Each chat appears exactly once: a repeated id is skipped, and
 * a parent cycle gets the member that comes first in group order as its root,
 * with the rest of the cycle and every chat hanging from it below. The build
 * is iterative, so depth does not limit it.
 */
export function buildChatTree<T extends TreeChat>(
  sorted: readonly T[],
  sort: ChatSort = "activity",
): ChatNode<T>[] {
  const nodes = new Map<string, ChatNode<T>>();
  const order: string[] = [];
  for (const thread of sorted) {
    if (nodes.has(thread.id)) continue;
    nodes.set(thread.id, {
      thread,
      children: [],
      descendants: 0,
      pinned: !!thread.isPinned,
      activity: Math.max(
        thread.updatedAt ?? 0,
        thread.latestAttentionAt ?? 0,
        thread.createdAt ?? 0,
      ),
    });
    order.push(thread.id);
  }
  const parentOf = (id: string): string | null => {
    const parent = nodes.get(id)!.thread.parentThreadId;
    return parent && nodes.has(parent) ? parent : null;
  };
  const kids = new Map<string, string[]>();
  for (const id of order) {
    const parent = parentOf(id);
    if (!parent) continue;
    const list = kids.get(parent);
    if (list) list.push(id);
    else kids.set(parent, [id]);
  }
  const placed = new Set<string>();
  const priority = (a: ChatNode<T>, b: ChatNode<T>) =>
    Number(b.pinned) - Number(a.pinned) ||
    (sort === "activity" ? b.activity - a.activity : 0);
  // Pre-order walk from `start`. A chat is claimed on first sight, so a cycle
  // ends where it comes back to a chat that is already placed.
  const grow = (start: string) => {
    const stack: { id: string; next: number }[] = [];
    const enter = (id: string) => {
      placed.add(id);
      stack.push({ id, next: 0 });
    };
    enter(start);
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const node = nodes.get(frame.id)!;
      const own = kids.get(frame.id) ?? [];
      if (frame.next < own.length) {
        const child = own[frame.next++]!;
        if (placed.has(child)) continue;
        node.children.push(nodes.get(child)!);
        enter(child);
      } else {
        node.children.sort(priority);
        stack.pop();
        const up = stack[stack.length - 1];
        if (up) {
          const parent = nodes.get(up.id)!;
          parent.descendants += node.descendants + 1;
          parent.pinned ||= node.pinned;
          parent.activity = Math.max(parent.activity, node.activity);
        }
      }
    }
  };
  const roots = order.filter((id) => !parentOf(id));
  for (const id of roots) grow(id);
  // Whatever no real root reaches sits in a parent cycle or hangs from one
  // (a chat that is its own parent is a cycle of one). Every such chat has an
  // unplaced parent, so walking up from it ends on a cycle member.
  const index = new Map(order.map((id, i) => [id, i]));
  const rooted = new Set(roots);
  for (const id of order) {
    if (placed.has(id)) continue;
    const walked = new Set<string>();
    let member = id;
    while (!walked.has(member)) {
      walked.add(member);
      member = parentOf(member)!;
    }
    let head = member;
    for (let m = parentOf(member)!; m !== member; m = parentOf(m)!)
      if (index.get(m)! < index.get(head)!) head = m;
    rooted.add(head);
    grow(head);
  }
  return order
    .filter((id) => rooted.has(id))
    .map((id) => nodes.get(id)!)
    .sort(priority);
}

/** Every chat below a node, in display order. */
export function descendantsOf<T extends TreeChat>(node: ChatNode<T>): T[] {
  const out: T[] = [];
  const stack = [...node.children].reverse();
  while (stack.length) {
    const next = stack.pop()!;
    out.push(next.thread);
    for (let i = next.children.length - 1; i >= 0; i--)
      stack.push(next.children[i]!);
  }
  return out;
}

/** What a collapsed branch tells about the chats it hides. */
export function branchSummary<T extends TreeChat>(
  node: ChatNode<T>,
  shown?: ReadonlySet<string>,
) {
  const below = descendantsOf(node).filter((t) => !shown?.has(t.id));
  const states = below.map((thread) =>
    threadStatus({
      indicator: (thread.indicator ?? "none") as Parameters<
        typeof threadStatus
      >[0]["indicator"],
      hasPendingInteraction: !!thread.hasPendingInteraction,
      isUnread: !!thread.isUnread,
      activity: {
        workflows: 0,
        backgroundAgents: 0,
        backgroundCommands: 0,
        planMode: 0,
        goals: 0,
        ...thread.activity,
      },
    }),
  );
  return {
    count: below.length,
    unread: below.some((t) => !!t.isUnread || t.indicator === "unread-success"),
    busy: states.includes("working"),
    attention: states.includes("failed")
      ? ("failed" as const)
      : states.includes("waiting")
        ? ("waiting" as const)
        : null,
  };
}

type VisibleParams = {
  expanded: boolean;
  limit: number;
  hideIdleMs: number;
  now?: number;
  activeThreadId?: string | null;
  collapsed?: ReadonlySet<string>;
  expandedBranches?: ReadonlySet<string>;
};

export type ChatRow<T extends TreeChat> = {
  node: ChatNode<T>;
  depth: number;
  expanded: boolean;
  summary: ReturnType<typeof branchSummary> | null;
};

/** Limit actual rows; keep important chats with their ancestor path. Manual folds win. */
export function visibleChatRows<T extends TreeChat>(
  roots: readonly ChatNode<T>[],
  params: VisibleParams,
): { rows: ChatRow<T>[]; hasHidden: boolean } {
  const flat: {
    node: ChatNode<T>;
    depth: number;
    parent: number;
    blocked: boolean;
    forced: boolean;
  }[] = [];
  const stack = [...roots].reverse().map((node) => ({
    node,
    depth: 0,
    parent: -1,
    blocked: false,
    forced: false,
  }));
  while (stack.length) {
    const item = stack.pop()!;
    const index = flat.push(item) - 1;
    for (let i = item.node.children.length - 1; i >= 0; i--) {
      stack.push({
        node: item.node.children[i]!,
        depth: item.depth + 1,
        parent: index,
        blocked: item.blocked || !!params.collapsed?.has(item.node.thread.id),
        forced:
          item.forced || !!params.expandedBranches?.has(item.node.thread.id),
      });
    }
  }
  const eligible = flat.map(
    ({ node, forced }) =>
      params.expanded || forced || isChatKeptVisible(node.thread, params),
  );
  for (let i = flat.length - 1; i >= 0; i--)
    if (eligible[i] && flat[i]!.parent >= 0) eligible[flat[i]!.parent] = true;
  let used = 0;
  const selected = flat.map(({ node, blocked, forced }, i) => {
    if (blocked || !eligible[i]) return false;
    // A branch unfolded by hand adds its rows on top: it never pushes other chats out.
    if (forced) return true;
    const t = node.thread;
    const withinLimit = used++ < params.limit;
    return (
      params.expanded ||
      forced ||
      withinLimit ||
      !!t.isPinned ||
      !!t.isUnread ||
      isThreadBusy(t) ||
      t.id === params.activeThreadId
    );
  });
  // Reverse order adds the whole context path once, without walking deep chains repeatedly.
  const below = flat.map(() => 0);
  for (let i = flat.length - 1; i >= 0; i--) {
    const parent = flat[i]!.parent;
    if (parent < 0) continue;
    if (selected[i]) selected[parent] = true;
    below[parent]! += below[i]! + Number(selected[i]);
  }
  const shown = new Set(
    flat.filter((_, i) => selected[i]).map(({ node }) => node.thread.id),
  );
  return {
    hasHidden: flat.some(({ blocked }, i) => !blocked && !selected[i]),
    rows: flat.flatMap(({ node, depth }, i) =>
      selected[i]
        ? [
            {
              node,
              depth,
              expanded: below[i]! > 0,
              summary:
                node.descendants > below[i]!
                  ? branchSummary(node, shown)
                  : null,
            },
          ]
        : [],
    ),
  };
}

/**
 * The parents of a chat exactly as the tree draws them, nearest first, or null
 * when the chat is not in it. Only these hide the chat when folded.
 */
export function ancestorsInTree<T extends TreeChat>(
  roots: readonly ChatNode<T>[],
  id: string,
): string[] | null {
  const parent = new Map<string, string | null>();
  const stack: { node: ChatNode<T>; up: string | null }[] = roots.map(
    (node) => ({
      node,
      up: null,
    }),
  );
  while (stack.length) {
    const { node, up } = stack.pop()!;
    parent.set(node.thread.id, up);
    for (const child of node.children)
      stack.push({ node: child, up: node.thread.id });
  }
  if (!parent.has(id)) return null;
  const chain: string[] = [];
  for (let at = parent.get(id) ?? null; at; at = parent.get(at) ?? null)
    chain.push(at);
  return chain;
}

export function parseCollapsedChats(raw: string | null): Set<string> {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}
