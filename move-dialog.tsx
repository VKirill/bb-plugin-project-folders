import { useState, useEffect, useCallback } from "react";
import { useRpc, useRealtime } from "@get-bb/plugin-sdk/app";
import type { rpcContract, Folder } from "./server";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Icon } from "./components/ui/icon";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./components/ui/dropdown-menu";
import { t, direction } from "./i18n";
import { FolderBrowser } from "./folder-browser";
export function MoveDialog({
  folder,
  onClose,
  onMoved,
}: {
  folder: Folder | null;
  onClose: () => void;
  onMoved: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [destination, setDestination] = useState("");
  /** true when the picked folder already exists: then nothing is moved. */
  const [adopt, setAdopt] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [listing, setListing] = useState<{
    path: string;
    parent: string | null;
    directories: { name: string; path: string }[];
  } | null>(null);
  useEffect(() => {
    setDestination("");
    setAdopt(false);
    setError("");
    setListing(null);
  }, [folder]);
  async function browse(path?: string) {
    if (!folder) return;
    setBusy(true);
    setError("");
    try {
      setListing(
        // An explicit undefined path is not a valid RPC value: omit the key.
        await rpc.call("project_browse", {
          hostId: folder.hostId,
          ...(path ? { path } : {}),
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function move() {
    if (!folder) return;
    setBusy(true);
    setError("");
    try {
      // An existing folder is adopted as is; a new one takes the files along.
      if (adopt)
        await rpc.call("copy_edit", {
          projectId: folder.projectId,
          hostId: folder.hostId,
          path: destination,
        });
      else
        await rpc.call("project_move", {
          projectId: folder.projectId,
          hostId: folder.hostId,
          destination,
        });
      onMoved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!folder}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="pf-dialog" dir={direction()}>
        <DialogHeader>
          <DialogTitle>{t("Перенести проект")}</DialogTitle>
          <DialogDescription>{folder?.name}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <p className="pf-folder-path">{folder?.path}</p>
        {listing ? (
          <>
            <p className="pf-folder-path">{listing.path}</p>
            <div className="pf-folder-picker">
              {listing.parent && (
                <button
                  disabled={busy}
                  onClick={() => void browse(listing.parent!)}
                >
                  <Icon name="ChevronLeft" />
                  {t("На уровень выше")}
                </button>
              )}
              {listing.directories.map((d) => (
                <button
                  disabled={busy}
                  key={d.path}
                  onClick={() => void browse(d.path)}
                >
                  <Icon name="Folder" />
                  {d.name}
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setListing(null)}
              >
                {t("Назад")}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  const name = folder!.path.split("/").filter(Boolean).at(-1)!;
                  setDestination(listing.path.replace(/\/$/, "") + "/" + name);
                  setAdopt(listing.directories.some((d) => d.name === name));
                  setListing(null);
                }}
              >
                {t("Выбрать папку")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void move();
            }}
          >
            <label className="pf-field">
              {t("Новый путь проекта")}
              <div className="pf-path-control">
                <Input
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    setAdopt(false);
                  }}
                  required
                  disabled={busy}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void browse()}
                  aria-label={t("Выбрать папку")}
                >
                  <Icon name="Folder" />
                </Button>
              </div>
            </label>
            {adopt ? (
              <p className="text-sm text-muted-foreground mb-3">
                {t(
                  "Папка с таким именем уже есть: проект привяжется к ней, файлы останутся на месте.",
                )}
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  {t(
                    "Вся папка переедет вместе со скрытыми файлами и архивом. Старый путь останется ссылкой для существующих чатов. История в базе BB остаётся в BB.",
                  )}
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  {t(
                    "Выберите новый, ещё не существующий путь на том же диске. Работающие чаты нужно завершить.",
                  )}
                </p>
              </>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onClose}
              >
                {t("Отмена")}
              </Button>
              <Button disabled={busy || !destination}>
                {busy
                  ? t("Выполняю…")
                  : adopt
                    ? t("Использовать эту папку")
                    : t("Перенести")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function SectionMoveDialog({
  folder,
  presetHost,
  onClose,
  onMoved,
}: {
  folder: Folder | null;
  presetHost?: string | null;
  onClose: () => void;
  onMoved: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [destination, setDestination] = useState("");
  /** true when the picked folder already exists: the section re-links to it. */
  const [adopt, setAdopt] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hostId, setHostId] = useState("");
  const [machines, setMachines] = useState<
    { id: string; name: string; connected: boolean }[]
  >([]);
  const [listing, setListing] = useState<{
    path: string;
    parent: string | null;
    directories: { name: string; path: string }[];
  } | null>(null);
  useEffect(() => {
    setDestination("");
    setAdopt(false);
    setError("");
    setListing(null);
    setHostId(presetHost || folder?.hostId || "");
    let live = true;
    if (folder)
      rpc.call("machines").then(
        (r) => live && setMachines(r.machines),
        () => {},
      );
    return () => {
      live = false;
    };
  }, [folder, presetHost, rpc]);
  const machine = machines.find((m) => m.id === hostId) ?? null;
  async function browse(path?: string) {
    if (!folder || !hostId) return;
    setBusy(true);
    setError("");
    try {
      setListing(
        // An explicit undefined path is not a valid RPC value: omit the key.
        await rpc.call("project_browse", {
          hostId,
          ...(path ? { path } : {}),
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function move() {
    if (!folder || !hostId) return;
    setBusy(true);
    setError("");
    try {
      if (hostId !== folder.hostId || adopt)
        await rpc.call("section_path_set", {
          folderId: folder.id,
          hostId,
          path: destination,
        });
      else await rpc.call("section_move", { folderId: folder.id, destination });
      onMoved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!folder}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="pf-dialog" dir={direction()}>
        <DialogHeader>
          <DialogTitle>{t("Изменить путь раздела")}</DialogTitle>
          <DialogDescription>{folder?.name}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <p className="pf-folder-path">{folder?.path}</p>
        <label className="pf-field">
          {t("Устройство")}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="mt-2 w-full justify-between"
                disabled={busy}
              >
                <span className="flex items-center gap-2">
                  <Icon name={machine?.connected ? "Zap" : "Monitor"} />
                  {machine ? machine.name : t("Загрузка устройств…")}
                </span>
                <Icon name="ChevronDown" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {machines.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  disabled={!m.connected}
                  onSelect={() => {
                    setHostId(m.id);
                    setListing(null);
                    setDestination("");
                    setAdopt(false);
                  }}
                >
                  <Icon name={m.connected ? "Zap" : "Monitor"} />
                  {m.name}
                  {!m.connected && (
                    <span className="text-muted-foreground">
                      {t("— не подключено")}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </label>
        <p className="text-sm text-muted-foreground mb-3">
          {t("У раздела может быть своя папка на каждом устройстве.")}{" "}
          {t("Разные разделы могут указывать на одну папку.")}
        </p>
        {listing ? (
          <>
            <FolderBrowser
              hostId={hostId}
              path={listing.path}
              parent={listing.parent}
              directories={listing.directories}
              loading={busy}
              navigate={(p) => void browse(p)}
              refresh={() => void browse(listing.path)}
              onBusyChange={setBusy}
            />
            <DialogFooter>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setListing(null)}
              >
                {t("Назад")}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setDestination(listing.path.replace(/\/$/, ""));
                  setAdopt(true);
                  setListing(null);
                }}
              >
                {t("Выбрать папку")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void move();
            }}
          >
            <label className="pf-field">
              {t("Новый путь раздела")}
              <div className="pf-path-control">
                <Input
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    setAdopt(false);
                  }}
                  required
                  disabled={busy}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void browse()}
                  aria-label={t("Выбрать папку")}
                >
                  <Icon name="Folder" />
                </Button>
              </div>
            </label>
            {adopt ? (
              <p className="text-sm text-muted-foreground mb-3">
                {t(
                  "Папка уже на новом месте: раздел привяжется к ней, файлы останутся как есть, а старый путь станет ссылкой для существующих чатов.",
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mb-3">
                {t(
                  "Папка раздела переедет целиком, со скрытыми файлами и историей чатов. Старый путь останется ссылкой. Работающие чаты нужно завершить.",
                )}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onClose}
              >
                {t("Отмена")}
              </Button>
              <Button disabled={busy || !destination}>
                {busy ? t("Выполняю…") : t("Изменить путь")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function PendingSectionMoves() {
  const rpc = useRpc<typeof rpcContract>();
  const [items, setItems] = useState<
    { folderId: string; destination: string; error: string | null }[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    rpc
      .call("pending_section_moves")
      .then(setItems, (e) => setError(String(e)));
  }, [rpc]);
  useEffect(refresh, [refresh]);
  useRealtime("changed", refresh);
  if (!items.length && !error) return null;
  return (
    <section className="pf-card">
      <h2>{t("Незавершённые переносы разделов")}</h2>
      {error && <p role="alert">{error}</p>}
      {items.map((m) => (
        <div key={m.folderId}>
          <p className="pf-folder-path">{m.destination}</p>
          {m.error && <p className="text-destructive text-sm">{m.error}</p>}
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await rpc.call("section_move", m);
                refresh();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Повторить")}
          </Button>
        </div>
      ))}
    </section>
  );
}
export function PendingMoves() {
  const rpc = useRpc<typeof rpcContract>();
  const [items, setItems] = useState<
    {
      projectId: string;
      hostId: string;
      destination: string;
      error: string | null;
    }[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    rpc.call("pending_moves").then(setItems, (e) => setError(String(e)));
  }, [rpc]);
  useEffect(refresh, [refresh]);
  useRealtime("changed", refresh);
  if (!items.length && !error) return null;
  return (
    <section className="pf-card">
      <h2>{t("Незавершённые переносы")}</h2>
      {error && <p role="alert">{error}</p>}
      {items.map((m) => (
        <div key={m.projectId}>
          <p className="pf-folder-path">{m.destination}</p>
          {m.error && <p className="text-destructive text-sm">{m.error}</p>}
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await rpc.call("project_move", m);
                refresh();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Повторить")}
          </Button>
        </div>
      ))}
    </section>
  );
}
