import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useComposer,
  useComposerView,
  useRealtime,
  useRpc,
  type PluginEnvironmentProviderInputsProps,
} from "@get-bb/plugin-sdk/app";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { Icon } from "./components/ui/icon";
import { useChipTaken } from "./composer-chip";
import type { Folder, rpcContract } from "./server";
import {
  composerEnvironmentId,
  currentPick,
  environmentLabel,
  recallPick,
  rememberPick,
  sectionOptions,
  SECTION_ENVIRONMENT_ID,
  type SectionTree,
} from "./section-tree";
import { direction, t, useLanguage } from "./i18n";
import { managedWorktreeEnvironment, placeOnHost } from "./execution";

export { SECTION_ENVIRONMENT_ID };

/** A group holds sections and has no folder a chat could run in. */
const isGroup = (f: Folder) => f.kind === "group";

/**
 * The control BB's own New thread screen renders beside "Project section".
 * A plain select, because it lives inside BB's environment popover: the tree
 * is carried by the indent, not by a second scrolling panel.
 */
export function SectionEnvironmentInputs({
  projectId,
  target,
  value,
  onChange,
}: PluginEnvironmentProviderInputsProps) {
  useLanguage();
  const rpc = useRpc<typeof rpcContract>();
  const [tree, setTree] = useState<SectionTree | null>(null);
  const [error, setError] = useState("");
  const hostId = target.kind === "existing-host" ? target.hostId : null;
  const chosen =
    value && typeof value === "object" && !Array.isArray(value)
      ? String((value as { folderId?: unknown }).folderId ?? "")
      : (recallPick(projectId, hostId) ?? "");
  useEffect(() => {
    let live = true;
    rpc.call("list", null).then(
      (r) => live && setTree({ folders: r.folders, roots: r.roots }),
      (e) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [rpc]);
  const options = useMemo(
    () =>
      tree && projectId && hostId
        ? sectionOptions(tree, projectId, hostId).filter(
            (o) => !isGroup(o.folder),
          )
        : [],
    [tree, projectId, hostId],
  );
  // A chosen section that is gone — archived, moved to another device — must
  // not submit silently under a stale id.
  useEffect(() => {
    if (!tree) return;
    if (chosen && !options.some((o) => o.folder.id === chosen))
      onChange({
        status: "blocked",
        reason: t("Раздел больше не доступен здесь. Выберите другой."),
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, chosen, options]);
  if (error)
    return (
      <p role="alert" className="pf-env-inputs-note text-destructive">
        {error}
      </p>
    );
  if (!projectId || !hostId)
    return (
      <p className="pf-env-inputs-note">
        {t("Сначала выберите проект и устройство.")}
      </p>
    );
  if (!tree) return <p className="pf-env-inputs-note">{t("Загрузка…")}</p>;
  if (options.length === 0)
    return (
      <p className="pf-env-inputs-note">
        {t("У проекта нет разделов на этом устройстве.")}
      </p>
    );
  return (
    <div className="pf pf-env-inputs" data-bb-ru-skip="">
      <select
        className="pf-select"
        aria-label={t("Раздел проекта")}
        value={chosen}
        onChange={(e) =>
          onChange(
            e.target.value
              ? { status: "ready", value: { folderId: e.target.value } }
              : { status: "blocked", reason: t("Выберите раздел проекта.") },
          )
        }
      >
        <option value="">{t("Выберите раздел проекта")}</option>
        {options.map(({ folder, depth }) => (
          <option key={folder.id} value={folder.id}>
            {`${"  ".repeat(depth)}${folder.name}`}
          </option>
        ))}
      </select>
      <p className="pf-env-inputs-note">
        {options.find((o) => o.folder.id === chosen)?.folder.path ??
          t("Чат начнёт работу в папке этого раздела.")}
      </p>
    </div>
  );
}

/**
 * A line under BB's own New thread composer naming the section the chat will
 * start in. BB's project chip says the project and stops there, so a chat
 * handed off to a new thread looked like it was starting at the project root
 * when it was really continuing in a section folder.
 */
export function ComposerSectionBanner() {
  useLanguage();
  const rpc = useRpc<typeof rpcContract>();
  const view = useComposerView();
  const projectId =
    view.scope.kind === "new-thread" ? view.scope.projectId : null;
  const [tree, setTree] = useState<
    (SectionTree & { bindings: Record<string, string> }) | null
  >(null);
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const load = useCallback(() => {
    rpc.call("list", null).then(
      (r) =>
        setTree({ folders: r.folders, roots: r.roots, bindings: r.bindings }),
      () => setTree(null),
    );
  }, [rpc]);
  useEffect(load, [load]);
  useRealtime("changed", load);
  // BB owns the environment picker and publishes no event for it, so the
  // selection is polled while the composer is on screen.
  useEffect(() => {
    const read = () =>
      setEnvironmentId(composerEnvironmentId(projectId, sessionStorage));
    read();
    const timer = setInterval(read, 1000);
    return () => clearInterval(timer);
  }, [projectId]);
  const found =
    tree && environmentId ? environmentLabel(tree, environmentId) : null;
  if (!found) return null;
  return (
    <p className="pf pf-composer-section" dir={direction()} title={found.path}>
      <span>{t("Чат начнётся в разделе:")}</span> {found.label}
    </p>
  );
}

/**
 * The section picker BB's own New thread screen gets from this plugin: a
 * control in the composer's action row, next to the model and the machine.
 *
 * BB's composer knows projects, not folders, and its environment picker needs
 * two clicks to reach ours. This is the one click: choose a section, and the
 * composer's environment switches to "Project section" on that section's
 * machine — `experimental_setSelection` applies it exactly as if the pickers
 * had been used by hand.
 */
export function SectionComposerAction() {
  useLanguage();
  // With the tree inside BB's project chip this action would offer the same
  // choice a second time and crowd the action row into BB's overflow menu.
  const chipTaken = useChipTaken();
  const rpc = useRpc<typeof rpcContract>();
  const composer = useComposer();
  const view = useComposerView();
  const projectId =
    view.scope.kind === "new-thread" ? view.scope.projectId : null;
  const [tree, setTree] = useState<SectionTree | null>(null);
  const [chosen, setChosen] = useState<Folder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    rpc
      .call("list", null)
      .then((r) => live && setTree({ folders: r.folders, roots: r.roots }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [rpc]);
  // A sent message starts a fresh draft: the section goes with it.
  useEffect(
    () =>
      composer.experimental_onSubmitted(() => {
        setChosen(null);
        rememberPick(null);
      }),
    [composer],
  );
  // Switching to another project drops a section of the old one. A pick that
  // belongs to the project being switched *to* is the reason for the switch —
  // the chip applies the section's project — and has to survive it.
  useEffect(() => {
    setChosen(null);
    const pick = currentPick();
    if (pick && pick.projectId !== projectId) rememberPick(null);
  }, [projectId]);
  const options = useMemo(() => {
    if (!tree || !projectId) return [];
    const hosts = [
      ...new Set(
        tree.roots
          .filter((r) => r.projectId === projectId)
          .map((r) => r.hostId),
      ),
    ];
    return hosts.flatMap((hostId) =>
      sectionOptions(tree, projectId, hostId)
        .filter((o) => !isGroup(o.folder))
        .map((o) => ({ ...o, hostId, many: hosts.length > 1 })),
    );
  }, [tree, projectId]);
  // Never render nothing: a control that vanishes when the composer has no
  // project yet reads as a missing feature. It says what it is waiting for.
  const unavailable = !projectId
    ? t("Сначала выберите проект")
    : !tree
      ? t("Загрузка…")
      : options.length === 0
        ? t("У проекта нет разделов")
        : "";
  const choose = async (folder: Folder) => {
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      let hostId = folder.hostId;
      let worktree = false;
      try {
        const read = await rpc.call("execution_read", {
          scope: {
            kind: "folder" as const,
            projectId,
            folderId: folder.id,
          },
        });
        worktree = read.effective.environment?.value === "worktree";
        const copies =
          folder.paths && folder.paths.length > 0
            ? folder.paths
            : [{ hostId: folder.hostId, path: folder.path }];
        hostId = placeOnHost(
          read.effective.machine?.hostId,
          { hostId: folder.hostId, path: folder.path },
          copies,
        ).hostId;
      } catch {
        worktree = false;
      }
      await rpc.call("section_pick", {
        projectId,
        hostId,
        folderId: folder.id,
      });
      rememberPick({ projectId, hostId, folderId: folder.id });
      await composer.experimental_setSelection({
        environment: worktree
          ? managedWorktreeEnvironment(hostId)
          : {
              type: "provider",
              environmentProviderId: SECTION_ENVIRONMENT_ID,
              machine: { type: "existing", hostId },
              inputs: { folderId: folder.id },
            },
      });
      setChosen(folder);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  if (chipTaken) return null;
  if (unavailable)
    return (
      <button
        type="button"
        className="pf-composer-pick"
        disabled
        title={unavailable}
        aria-label={t("Раздел проекта")}
      >
        <Icon name="Folder" />
        <span className="min-w-0 truncate">{t("Раздел")}</span>
      </button>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="pf-composer-pick"
          disabled={busy}
          title={error || chosen?.path || t("Раздел проекта")}
          aria-label={t("Раздел проекта")}
        >
          <Icon name="Folder" />
          <span className="min-w-0 truncate">
            {chosen?.name ?? t("Раздел")}
          </span>
          <Icon name="ChevronDown" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        collisionPadding={8}
        className="max-h-80 overflow-auto min-w-56 max-w-[min(90vw,26rem)]"
      >
        {options.map(({ folder, depth, many }) => (
          <DropdownMenuItem
            key={folder.id}
            style={depth > 0 ? { paddingLeft: 8 + depth * 16 } : undefined}
            onSelect={() => void choose(folder)}
          >
            <Icon name="Folder" />
            {folder.name}
            {many && <span className="pf-menu-host">· {folder.hostId}</span>}
            {chosen?.id === folder.id ? " ✓" : ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
