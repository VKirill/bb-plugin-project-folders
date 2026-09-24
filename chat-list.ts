export type ChatSort = "activity" | "title" | "created";
export type ChatListSettings = {
  sort: ChatSort;
  limit: number;
  autoCollapseInactive: boolean;
  threadDisplay: "classic" | "provider-status";
};
export const defaults: ChatListSettings = {
  sort: "activity",
  limit: 10,
  autoCollapseInactive: true,
  threadDisplay: "classic",
};
export const INACTIVE_SECTION_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export function parseSettings(raw: string | null): ChatListSettings {
  try {
    const value = JSON.parse(raw || "{}");
    return {
      sort: ["activity", "title", "created"].includes(value.sort)
        ? value.sort
        : defaults.sort,
      limit:
        Number.isInteger(value.limit) && value.limit >= 1 && value.limit <= 100
          ? value.limit
          : defaults.limit,
      autoCollapseInactive:
        typeof value.autoCollapseInactive === "boolean"
          ? value.autoCollapseInactive
          : defaults.autoCollapseInactive,
      threadDisplay:
        value.threadDisplay === "provider-status"
          ? "provider-status"
          : defaults.threadDisplay,
    };
  } catch {
    return defaults;
  }
}
type Chat = {
  id: string;
  title: string | null;
  titleFallback: string | null;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  latestAttentionAt: number;
};
export function sortChats<T extends Chat>(
  chats: readonly T[],
  sort: ChatSort,
  locale: string,
): T[] {
  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: "base",
  });
  return chats
    .filter((c) => !c.isArchived)
    .sort((a, b) => {
      const pinned = Number(b.isPinned) - Number(a.isPinned);
      if (pinned) return pinned;
      const primary =
        sort === "title"
          ? collator.compare(
              a.title || a.titleFallback || "",
              b.title || b.titleFallback || "",
            )
          : sort === "created"
            ? b.createdAt - a.createdAt
            : Math.max(b.updatedAt, b.latestAttentionAt, b.createdAt) -
              Math.max(a.updatedAt, a.latestAttentionAt, a.createdAt);
      return primary || a.id.localeCompare(b.id);
    });
}

export type ChatThread = {
  id: string;
  projectId: string;
  environment?: { id: string | null } | null;
  createdAt?: number;
  updatedAt?: number;
  lastReadAt?: number | null;
  latestAttentionAt?: number;
  indicator?: string;
  hasPendingInteraction?: boolean;
  isUnread?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
  status?: string;
  activity?: {
    workflows?: number;
    backgroundAgents?: number;
    backgroundCommands?: number;
    planMode?: number;
    goals?: number;
  };
};

export type CollapseRecord = {
  collapsed: boolean;
  at: number;
};

export function parseCollapseState(
  raw: string | null,
): Record<string, CollapseRecord> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, CollapseRecord> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") {
        result[k] = { collapsed: v, at: 0 };
      } else if (
        v &&
        typeof v === "object" &&
        typeof (v as { collapsed?: unknown }).collapsed === "boolean"
      ) {
        result[k] = {
          collapsed: (v as { collapsed: boolean }).collapsed,
          at:
            typeof (v as { at?: unknown }).at === "number"
              ? (v as { at: number }).at
              : 0,
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Last time anyone opened the chat or it produced activity. */
export function getThreadAccess(thread: {
  updatedAt?: number;
  latestAttentionAt?: number;
  createdAt?: number;
  lastReadAt?: number | null;
}): number {
  return Math.max(
    thread.updatedAt ?? 0,
    thread.latestAttentionAt ?? 0,
    thread.createdAt ?? 0,
    thread.lastReadAt ?? 0,
  );
}

export function isChatKeptVisible(
  thread: ChatThread,
  params: {
    hideIdleMs: number;
    now?: number;
    activeThreadId?: string | null;
  },
): boolean {
  const { hideIdleMs, now = Date.now(), activeThreadId } = params;
  if (hideIdleMs <= 0) return true;
  if (thread.isPinned) return true;
  if (thread.isUnread) return true;
  if (activeThreadId && thread.id === activeThreadId) return true;
  if (isThreadBusy(thread)) return true;
  return now - getThreadAccess(thread) <= hideIdleMs;
}

/** Chats shown before «Show all»: recent enough, then the per-section limit. */
export function visibleChats<T extends ChatThread>(
  sorted: readonly T[],
  params: {
    expanded: boolean;
    limit: number;
    hideIdleMs: number;
    now?: number;
    activeThreadId?: string | null;
  },
): T[] {
  if (params.expanded) return [...sorted];
  return sorted
    .filter((thread) => isChatKeptVisible(thread, params))
    .slice(0, params.limit);
}

export function getThreadActivity(thread: {
  updatedAt?: number;
  latestAttentionAt?: number;
  createdAt?: number;
  lastReadAt?: number | null;
}): number {
  // BB sets updatedAt = lastReadAt = Date.now() whenever a thread is opened/read.
  // To detect actual conversation activity (messages, turns, attention), ignore updatedAt
  // if it only reflects reading the thread without new messages.
  const isOnlyRead =
    thread.updatedAt &&
    thread.lastReadAt &&
    Math.abs(thread.updatedAt - thread.lastReadAt) < 2000;
  const effectiveUpdatedAt = isOnlyRead ? 0 : (thread.updatedAt ?? 0);

  return Math.max(
    effectiveUpdatedAt,
    thread.latestAttentionAt ?? 0,
    thread.createdAt ?? 0,
  );
}

export function isThreadBusy(thread: {
  indicator?: string;
  hasPendingInteraction?: boolean;
  status?: string;
  activity?: {
    workflows?: number;
    backgroundAgents?: number;
    backgroundCommands?: number;
  };
}): boolean {
  if (thread.status === "active") return true;
  if (thread.indicator && thread.indicator !== "none") return true;
  if (thread.hasPendingInteraction) return true;
  if (thread.activity) {
    if ((thread.activity.workflows ?? 0) > 0) return true;
    if ((thread.activity.backgroundAgents ?? 0) > 0) return true;
    if ((thread.activity.backgroundCommands ?? 0) > 0) return true;
  }
  return false;
}

export function collectSubtreeFolderIds(
  folderId: string,
  projectId: string,
  folders: readonly {
    id: string;
    projectId: string;
    parentId: string | null;
  }[],
): Set<string> {
  const ids = new Set<string>([folderId]);
  let added = true;
  while (added) {
    added = false;
    for (const f of folders) {
      if (
        f.projectId === projectId &&
        f.parentId &&
        ids.has(f.parentId) &&
        !ids.has(f.id)
      ) {
        ids.add(f.id);
        added = true;
      }
    }
  }
  return ids;
}

/**
 * Where a chat sits in the tree: the section it was filed into by hand, else
 * the section of the folder it works in. An empty place is the project root.
 */
export function placeOf(
  thread: ChatThread,
  bindings: Record<string, string>,
  places?: Record<string, string>,
): string | null {
  const placed = places?.[thread.id];
  if (placed !== undefined) return placed || null;
  return bindings[thread.environment?.id ?? ""] ?? null;
}

export function collectFolderThreads<T extends ChatThread>(
  folderId: string,
  projectId: string,
  folders: readonly {
    id: string;
    projectId: string;
    parentId: string | null;
  }[],
  bindings: Record<string, string>,
  threads: readonly T[],
  places?: Record<string, string>,
): T[] {
  const folderIds = collectSubtreeFolderIds(folderId, projectId, folders);
  return threads.filter(
    (t) =>
      t.projectId === projectId &&
      folderIds.has(placeOf(t, bindings, places) ?? ""),
  );
}

export function isSectionInactive<T extends ChatThread>(params: {
  folderId: string;
  projectId: string;
  folders: readonly {
    id: string;
    projectId: string;
    parentId: string | null;
  }[];
  bindings: Record<string, string>;
  places?: Record<string, string>;
  threads: readonly T[];
  activeThreadId?: string | null;
  thresholdMs?: number;
  now?: number;
}): boolean {
  const {
    folderId,
    projectId,
    folders,
    bindings,
    places,
    threads,
    activeThreadId,
    thresholdMs = INACTIVE_SECTION_THRESHOLD_MS,
    now = Date.now(),
  } = params;

  const sectionThreads = collectFolderThreads(
    folderId,
    projectId,
    folders,
    bindings,
    threads,
    places,
  );

  if (sectionThreads.length === 0) return false;
  if (activeThreadId && sectionThreads.some((t) => t.id === activeThreadId)) {
    return false;
  }
  if (sectionThreads.some(isThreadBusy)) {
    return false;
  }

  const latestActivity = Math.max(...sectionThreads.map(getThreadActivity));
  if (latestActivity <= 0) return true;

  return now - latestActivity > thresholdMs;
}

export function isSectionCollapsed<T extends ChatThread>(params: {
  folderId: string;
  projectId: string;
  root: boolean;
  folders: readonly {
    id: string;
    projectId: string;
    parentId: string | null;
  }[];
  bindings: Record<string, string>;
  places?: Record<string, string>;
  threads: readonly T[];
  record?: CollapseRecord;
  activeThreadId?: string | null;
  autoCollapseInactive?: boolean;
  thresholdMs?: number;
  now?: number;
}): boolean {
  const {
    folderId,
    projectId,
    root,
    folders,
    bindings,
    places,
    threads,
    record,
    activeThreadId,
    autoCollapseInactive = true,
    thresholdMs = INACTIVE_SECTION_THRESHOLD_MS,
    now = Date.now(),
  } = params;

  if (record?.collapsed) {
    return true;
  }

  if (root) {
    return false;
  }

  if (!autoCollapseInactive) {
    return false;
  }

  const sectionThreads = collectFolderThreads(
    folderId,
    projectId,
    folders,
    bindings,
    threads,
    places,
  );

  if (record && !record.collapsed && record.at > 0) {
    if (now - record.at < thresholdMs) {
      return false;
    }
  }

  if (activeThreadId && sectionThreads.some((t) => t.id === activeThreadId)) {
    return false;
  }

  if (sectionThreads.some(isThreadBusy)) {
    return false;
  }

  const hasChats = sectionThreads.length > 0;
  const latestActivity = hasChats
    ? Math.max(...sectionThreads.map(getThreadActivity))
    : 0;

  if (!hasChats || latestActivity <= 0 || now - latestActivity > thresholdMs) {
    return true;
  }

  return false;
}

function threadNeedsReply<T extends ChatThread>(thread: T): boolean {
  return !!thread.isUnread || !!thread.hasPendingInteraction;
}

export function folderActivity<T extends ChatThread>(params: {
  folderId: string;
  projectId: string;
  root: boolean;
  folders: readonly {
    id: string;
    projectId: string;
    parentId: string | null;
  }[];
  bindings: Record<string, string>;
  places?: Record<string, string>;
  threads: readonly T[];
}): { rank: number; activity: number } {
  const { folderId, projectId, root, folders, bindings, places, threads } =
    params;
  const sectionThreads = (
    root
      ? threads.filter((t) => t.projectId === projectId)
      : collectFolderThreads(
          folderId,
          projectId,
          folders,
          bindings,
          threads,
          places,
        )
  ).filter((t) => !t.isArchived);
  const unread = sectionThreads.some(threadNeedsReply);
  const busy = sectionThreads.some(isThreadBusy);
  const activity = sectionThreads.length
    ? Math.max(...sectionThreads.map(getThreadActivity))
    : 0;
  const rank = unread ? 3 : busy ? 2 : activity > 0 ? 1 : 0;
  return { rank, activity };
}

export function sortFoldersByActivity<
  TFolder extends {
    id: string;
    projectId: string;
    sort?: number;
  },
  TThread extends ChatThread,
>(
  folders: readonly TFolder[],
  params: {
    enabled: boolean;
    root: boolean;
    folders: readonly {
      id: string;
      projectId: string;
      parentId: string | null;
    }[];
    bindings: Record<string, string>;
    places?: Record<string, string>;
    threads: readonly TThread[];
  },
): TFolder[] {
  const list = [...folders];
  const manual = (a: TFolder, b: TFolder) =>
    (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id);
  if (!params.enabled) return list.sort(manual);
  return list.sort((a, b) => {
    const sa = folderActivity({
      folderId: a.id,
      projectId: a.projectId,
      root: params.root,
      folders: params.folders,
      bindings: params.bindings,
      places: params.places,
      threads: params.threads,
    });
    const sb = folderActivity({
      folderId: b.id,
      projectId: b.projectId,
      root: params.root,
      folders: params.folders,
      bindings: params.bindings,
      places: params.places,
      threads: params.threads,
    });
    if (sb.rank !== sa.rank) return sb.rank - sa.rank;
    if (sb.activity !== sa.activity) return sb.activity - sa.activity;
    return manual(a, b);
  });
}

export function hasFolderUnread<T extends ChatThread>(params: {
  folderId: string;
  projectId: string;
  root: boolean;
  folders: readonly {
    id: string;
    projectId: string;
    parentId: string | null;
  }[];
  bindings: Record<string, string>;
  places?: Record<string, string>;
  threads: readonly T[];
}): boolean {
  const { folderId, projectId, root, folders, bindings, places, threads } =
    params;
  if (root) {
    return threads.some(
      (t) => t.projectId === projectId && !t.isArchived && !!t.isUnread,
    );
  }
  const sectionThreads = collectFolderThreads(
    folderId,
    projectId,
    folders,
    bindings,
    threads,
    places,
  );
  return sectionThreads.some((t) => !t.isArchived && !!t.isUnread);
}
