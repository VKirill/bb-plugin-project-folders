import { isChatKeptVisible, isThreadBusy, type ChatThread } from "./chat-list";

export type TreeChat = ChatThread & { parentThreadId?: string | null };

export type ChatNode<T extends TreeChat> = {
  thread: T;
  children: ChatNode<T>[];
  /** Every chat below this one, at any depth. */
  descendants: number;
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
): ChatNode<T>[] {
  const nodes = new Map<string, ChatNode<T>>();
  const order: string[] = [];
  for (const thread of sorted) {
    if (nodes.has(thread.id)) continue;
    nodes.set(thread.id, { thread, children: [], descendants: 0 });
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
        stack.pop();
        const up = stack[stack.length - 1];
        if (up) nodes.get(up.id)!.descendants += node.descendants + 1;
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
  return order.filter((id) => rooted.has(id)).map((id) => nodes.get(id)!);
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
export function branchSummary<T extends TreeChat>(node: ChatNode<T>) {
  const below = descendantsOf(node);
  return {
    count: node.descendants,
    unread: below.some((t) => !!t.isUnread),
    busy: below.some(isThreadBusy),
  };
}

type VisibleParams = {
  expanded: boolean;
  limit: number;
  hideIdleMs: number;
  now?: number;
  activeThreadId?: string | null;
};

/**
 * Roots shown before «Show all». Idle hiding and the limit work on roots, so
 * a branch is never cut apart; a root stays while it, or a chat below it,
 * passes the idle test. Past the limit a root still stays when a chat below
 * it is pinned, unread, busy or open: hiding the parent would hide that chat.
 */
export function visibleChatRoots<T extends TreeChat>(
  roots: readonly ChatNode<T>[],
  params: VisibleParams,
): ChatNode<T>[] {
  if (params.expanded) return [...roots];
  const kept = roots.filter(
    (root) =>
      isChatKeptVisible(root.thread, params) ||
      descendantsOf(root).some((t) => isChatKeptVisible(t, params)),
  );
  const shown: ChatNode<T>[] = [];
  for (const root of kept) {
    if (
      shown.length < params.limit ||
      descendantsOf(root).some(
        (t) =>
          t.isPinned ||
          t.isUnread ||
          isThreadBusy(t) ||
          (!!params.activeThreadId && t.id === params.activeThreadId),
      )
    )
      shown.push(root);
  }
  return shown;
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
  const stack: { node: ChatNode<T>; up: string | null }[] = roots.map((node) => ({
    node,
    up: null,
  }));
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
