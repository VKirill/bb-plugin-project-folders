import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  experimental_useSidebarThreads,
  useComposer,
  useComposerView,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { Icon } from "./components/ui/icon";
import type { Folder, rpcContract } from "./server";
import {
  chipEntries,
  currentPick,
  placeLabel,
  subscribePick,
  rememberPick,
  SECTION_ENVIRONMENT_ID,
  type ChipEntry,
  type SectionTree,
} from "./section-tree";
import { t, useLanguage } from "./i18n";
import { managedWorktreeEnvironment } from "./execution";

/** The class marking the span a replacement chip is portalled into. */
export const NATIVE_SLOT_CLASS = "pf-native-project-slot";

/**
 * BB's own project chip, if it is still BB's. A chip already replaced — by
 * this component or by the plugin's own New chat screen — is skipped, both
 * because the replacement carries the same attribute and because two owners
 * would insert two chips beside one control.
 */
export function takeableProjectControl(root: ParentNode): HTMLElement | null {
  for (const el of Array.from(
    root.querySelectorAll<HTMLElement>("[data-promptbox-project-control]"),
  )) {
    if (el.closest(`.${NATIVE_SLOT_CLASS}`)) continue;
    if (el.previousElementSibling?.classList.contains(NATIVE_SLOT_CLASS))
      continue;
    return el;
  }
  return null;
}

/** The nearest ancestor of `from` that still holds an untaken project chip. */
export function controlOwner(from: HTMLElement): HTMLElement | null {
  for (let el = from.parentElement; el; el = el.parentElement)
    if (takeableProjectControl(el)) return el;
  return null;
}

export type ChipSlot = { node: HTMLElement; className: string };

/**
 * Holds BB's project chip on behalf of a replacement, and hands it back
 * untouched. `sync` is cheap to call as often as the composer re-renders: as
 * long as the chip taken is still in the document with the replacement's span
 * beside it, there is nothing to do. The search only runs again once BB has
 * thrown one of them away — which is also why a chip already taken is not a
 * candidate: finding "nothing to take" while holding one means we are the
 * reason, not that the composer lost its chip.
 */
export function chipTakeover(
  find: () => HTMLElement | null,
  apply: (slot: ChipSlot | null) => void,
) {
  let original: HTMLElement | null = null;
  let mount: HTMLElement | null = null;
  let display = "";
  const release = () => {
    if (original) original.style.display = display;
    mount?.remove();
    original = null;
    mount = null;
  };
  return {
    sync() {
      if (original?.isConnected && mount?.isConnected) return;
      release();
      const button = find();
      if (!button) {
        apply(null);
        return;
      }
      original = button;
      display = button.style.display;
      mount = document.createElement("span");
      mount.className = `${NATIVE_SLOT_CLASS} inline-flex min-w-0`;
      button.before(mount);
      button.style.display = "none";
      apply({ node: mount, className: button.className });
    },
    release() {
      release();
      apply(null);
    },
  };
}

/**
 * Whether the native chip is currently showing the tree. The composer's
 * separate "Section" action is the fallback for when it is not: with both on
 * screen the action row would offer the same choice twice and crowd itself
 * into BB's overflow menu.
 */
let taken = false;
const watchers = new Set<() => void>();
const readTaken = () => taken;
function setTaken(next: boolean) {
  if (taken === next) return;
  taken = next;
  for (const fn of Array.from(watchers)) fn();
}
export function useChipTaken() {
  return useSyncExternalStore(
    (fn) => {
      watchers.add(fn);
      return () => watchers.delete(fn);
    },
    readTaken,
    readTaken,
  );
}

/**
 * The project/section tree inside BB's own project chip on the New thread
 * screen.
 *
 * BB's composer knows projects, not folders: its chip lists projects flat, so
 * a chat started there lands in a project root however deep the section tree
 * goes. This hides that chip and puts the plugin's tree in its place, styled
 * with the chip's own classes. Choosing a place applies it through the
 * composer's own pickers — the project, and the environment that puts the
 * chat in that folder — exactly as if they had been used by hand.
 *
 * Nothing is forced: when the chip cannot be found the native control stays
 * untouched and the composer's "Section" action remains the way in.
 */
export function ComposerProjectChip() {
  useLanguage();
  const rpc = useRpc<typeof rpcContract>();
  const composer = useComposer();
  const view = useComposerView();
  const marker = useRef<HTMLSpanElement>(null);
  const [slot, setSlot] = useState<{
    node: HTMLElement;
    className: string;
  } | null>(null);
  const [tree, setTree] = useState<SectionTree | null>(null);
  const [chosen, setChosen] = useState<ChipEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const projectId =
    view.scope.kind === "new-thread" ? view.scope.projectId : null;
  const { projects } = experimental_useSidebarThreads();
  // A pick made here remounts this component (it applies a project), and a
  // pick made in the composer's own Section action happens elsewhere entirely,
  // so the chip follows the store rather than its own state alone.
  const pick = useSyncExternalStore(subscribePick, currentPick, currentPick);
  const load = useCallback(() => {
    rpc
      .call("list", null)
      .then((r) => setTree({ folders: r.folders, roots: r.roots }))
      .catch(() => undefined);
  }, [rpc]);
  useEffect(load, [load]);
  useRealtime("changed", load);
  // Take over the chip, and hand it back exactly as it was on the way out.
  useEffect(() => {
    const anchor = marker.current;
    if (!anchor) return;
    let frame = 0;
    const takeover = chipTakeover(
      () => {
        const owner = controlOwner(anchor);
        return owner ? takeableProjectControl(owner) : null;
      },
      (next) => {
        setSlot(next);
        setTaken(Boolean(next));
      },
    );
    takeover.sync();
    // BB re-renders its action row as the draft changes; the chip is looked
    // for again then, once per batch of changes rather than once per change.
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        takeover.sync();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      takeover.release();
    };
  }, []);
  // A sent message starts a fresh draft.
  useEffect(
    () =>
      composer.experimental_onSubmitted(() => {
        setChosen(null);
        setError("");
        rememberPick(null);
      }),
    [composer],
  );
  const entries = useMemo(
    () => (tree ? chipEntries(tree, projects) : []),
    [tree, projects],
  );
  const current = useMemo(() => {
    if (chosen) return chosen;
    // Applying a project remounts this component, so the section survives in
    // the pick the plugin remembers, not in state.
    const section = pick
      ? entries.find((e) => e.folder?.id === pick.folderId)
      : undefined;
    return (
      section ??
      entries.find((e) => e.kind === "project" && e.projectId === projectId) ??
      null
    );
  }, [chosen, entries, pick, projectId]);
  const choose = async (entry: ChipEntry) => {
    const folder = entry.folder;
    setBusy(true);
    setError("");
    try {
      if (entry.kind === "section" && folder) {
        await rpc.call("section_pick", {
          projectId: entry.projectId,
          hostId: folder.hostId,
          folderId: folder.id,
        });
        rememberPick({
          projectId: entry.projectId,
          hostId: folder.hostId,
          folderId: folder.id,
        });
      } else rememberPick(null);
      let worktree = false;
      if (folder && entry.kind !== "group") {
        try {
          const read = await rpc.call("execution_read", {
            scope:
              entry.kind === "section"
                ? {
                    kind: "folder" as const,
                    projectId: entry.projectId,
                    folderId: folder.id,
                  }
                : { kind: "project" as const, projectId: entry.projectId },
          });
          worktree = read.effective.environment?.value === "worktree";
        } catch {
          worktree = false;
        }
      }
      await composer.experimental_setSelection({
        projectId: entry.projectId,
        // A project BB knows and the plugin has no folder for keeps BB's own
        // environment: there is nothing here to point it at.
        ...(folder
          ? {
              environment: worktree
                ? managedWorktreeEnvironment(folder.hostId)
                : entry.kind === "section"
                  ? {
                      type: "provider" as const,
                      environmentProviderId: SECTION_ENVIRONMENT_ID,
                      machine: {
                        type: "existing" as const,
                        hostId: folder.hostId,
                      },
                      inputs: { folderId: folder.id },
                    }
                  : {
                      // The project root, the way the plugin's own New chat
                      // screen starts one: BB's checkout provider at the folder.
                      type: "provider" as const,
                      environmentProviderId: "project-checkout",
                      machine: {
                        type: "existing" as const,
                        hostId: folder.hostId,
                      },
                      inputs: { path: folder.path },
                    },
            }
          : {}),
      });
      setChosen(entry);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const name = (entry: ChipEntry) =>
    entry.personal
      ? t("Без проекта")
      : entry.kind === "project"
        ? entry.projectName
        : (entry.folder?.name ?? entry.projectName);
  const label = !current
    ? t("Проект или раздел")
    : current.personal
      ? t("Без проекта")
      : tree
        ? placeLabel(tree, current)
        : current.projectName;
  return (
    <>
      <span ref={marker} hidden aria-hidden="true" />
      {slot &&
        createPortal(
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={slot.className}
                data-promptbox-project-control=""
                disabled={busy}
                aria-label={t("Проекты и разделы")}
                title={error || current?.folder?.path || label}
              >
                <Icon name="Folder" />
                <span className="min-w-0 truncate">{label}</span>
                <Icon name="ChevronDown" />
              </button>
            </DropdownMenuTrigger>
            {/* Anchored to the chip's left edge: a wide tree centred on a chip
                at the composer's left edge hangs off-screen. */}
            <DropdownMenuContent
              align="start"
              collisionPadding={8}
              className="max-h-80 overflow-auto min-w-64 max-w-[min(90vw,26rem)]"
            >
              {entries.map((entry) => {
                const key = entry.folder
                  ? `${entry.projectId}:${entry.folder.id}`
                  : entry.projectId;
                return entry.kind === "group" ? (
                  <div
                    key={key}
                    className="pf-menu-group"
                    style={{ paddingLeft: 8 + entry.depth * 16 }}
                  >
                    <Icon name="Layers" />
                    {name(entry)}
                  </div>
                ) : (
                  <DropdownMenuItem
                    key={key}
                    style={
                      entry.depth > 0
                        ? { paddingLeft: 8 + entry.depth * 16 }
                        : undefined
                    }
                    onSelect={() => void choose(entry)}
                  >
                    <Icon name={entry.personal ? "MessageSquare" : "Folder"} />
                    {name(entry)}
                    {current?.projectId === entry.projectId &&
                    (current?.folder?.id ?? null) === (entry.folder?.id ?? null)
                      ? " ✓"
                      : ""}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>,
          slot.node,
        )}
    </>
  );
}
