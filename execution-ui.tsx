import { useCallback, useEffect, useState } from "react";
import {
  UrlLink,
  useRpc,
  experimental_PermissionModePicker as PermissionModePicker,
  experimental_ProviderModelPicker as ProviderModelPicker,
} from "@get-bb/plugin-sdk/app";
import type { ExecutionScope, rpcContract } from "./server";
import {
  CLI_AGENTS_URL,
  hasModelPin,
  machineLabel,
  normalizeExecution,
  seedMachineId,
  type AgentCatalog,
  type EnvironmentMode,
  type Execution,
  type ExecutionFallback,
  type Origin,
  type PermissionMode,
  type ReasoningLevel,
  type ResolvedExecution,
  type ServiceTier,
} from "./execution";
import { t } from "./i18n";
import { Help } from "./agents-apply";
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import { Switch } from "./settings-ui";

type Loaded = {
  own: Execution;
  effective: ResolvedExecution;
  inherited: ResolvedExecution;
  hostId: string | null;
  hosts: { id: string; name: string }[];
  knownHosts?: { id: string; name: string }[];
  fallback: ExecutionFallback | null;
  agents: AgentCatalog;
};
type PickerValue = {
  providerId: string;
  model: string;
  reasoningLevel: ReasoningLevel;
  serviceTier?: ServiceTier;
};
const INHERIT = "__inherit";
const NO_AGENT = "__none";

/** Where a value that is not pinned here comes from, in one short phrase. */
function originLabel(origin: Origin | undefined, scope: ExecutionScope) {
  if (!origin) return t("как в BB");
  if (origin.scope === "global") return t("из настроек плагина");
  if (origin.scope === "project") return t("из проекта");
  return scope.kind === "folder" && origin.folderId === scope.folderId
    ? t("отсюда")
    : t("из раздела выше");
}

/**
 * The provider, model, reasoning level, service tier, permission mode and
 * session agent new chats start with here. Every group can be left off, and
 * then it is inherited: the nearest section that pins it, else the project,
 * else the plugin-wide default, else BB's own remembered choice.
 */
export function ExecutionEditor({
  scope,
  /** Rendered beside the controls: the agents column of the settings page. */
  aside,
}: {
  scope: ExecutionScope;
  aside?: React.ReactNode;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<Execution>({});
  /**
   * A group can be switched on before it holds anything — when nothing is
   * pinned above and BB has no remembered choice either, the picker opens
   * empty and the user chooses. Saving an empty group simply stores nothing.
   */
  const [modelOn, setModelOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const key =
    scope.kind === "folder"
      ? `f:${scope.folderId}`
      : scope.kind === "project"
        ? `p:${scope.projectId}`
        : "g";
  const load = useCallback(async () => {
    const value = (await rpc.call("execution_read", { scope })) as Loaded;
    setState(value);
    setDraft(value.own);
    setModelOn(hasModelPin(value.own));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc, key]);
  useEffect(() => {
    let live = true;
    setState(null);
    setError("");
    setSaved(false);
    load().catch((e) => {
      if (live) setError(String(e));
    });
    return () => {
      live = false;
    };
  }, [load]);
  if (error && !state)
    return (
      <p role="alert" className="text-destructive text-sm">
        {error}
      </p>
    );
  if (!state) return <p className="pf-agents-hint">{t("Загрузка…")}</p>;

  const patch = (next: Partial<Execution>) => {
    setDraft((current) => ({ ...current, ...next }));
    setSaved(false);
  };
  const inheritedModel = state.inherited.model;
  /**
   * What the picker is shown, and what it must get back unchanged.
   *
   * A group that is on reads from the draft alone. Mixing in the inherited
   * value field by field made the picker and this state argue: it resolves a
   * model with no service tier, we hand the inherited tier back, it resolves
   * again — a loop that ends in "Maximum update depth exceeded" and takes the
   * whole panel down with it. A group that is off shows what it inherits and
   * ignores what the picker says.
   */
  const inheritedTier =
    inheritedModel?.serviceTier ?? state.fallback?.serviceTier;
  const shownModel: PickerValue = modelOn
    ? {
        providerId: draft.providerId ?? "",
        model: draft.model ?? "",
        reasoningLevel: draft.reasoningLevel ?? "medium",
        ...(draft.serviceTier ? { serviceTier: draft.serviceTier } : {}),
      }
    : {
        providerId:
          inheritedModel?.providerId ?? state.fallback?.providerId ?? "",
        model: inheritedModel?.model ?? state.fallback?.model ?? "",
        reasoningLevel:
          inheritedModel?.reasoningLevel ??
          state.fallback?.reasoningLevel ??
          "medium",
        ...(inheritedTier ? { serviceTier: inheritedTier } : {}),
      };
  const shownPermission: PermissionMode =
    draft.permissionMode ??
    state.inherited.permissionMode?.value ??
    state.fallback?.permissionMode ??
    "auto";
  const shownEnvironment: EnvironmentMode =
    draft.environmentMode ??
    state.inherited.environment?.value ??
    "folder";
  const knownMachines = [...(state.knownHosts ?? []), ...state.hosts];
  const labelOf = (id: string) =>
    machineLabel(id, knownMachines, t("неизвестная машина"));
  const seedHostId = seedMachineId(
    state.hosts,
    draft.hostId ?? state.inherited.machine?.hostId,
  );
  const shownMachine =
    draft.hostId ??
    state.inherited.machine?.hostId ??
    seedHostId ??
    state.hostId ??
    "";
  const agentValue =
    draft.agentMode === "agent"
      ? (draft.agentId ?? INHERIT)
      : draft.agentMode === "none"
        ? NO_AGENT
        : INHERIT;
  const routingHost =
    draft.hostId ?? state.inherited.machine?.hostId ?? state.hostId;
  const routing = routingHost
    ? ({ kind: "host", hostId: routingHost } as const)
    : undefined;
  const agentsUsable =
    scope.kind !== "global" && state.agents.installed && state.agents.supported;
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      // A switched-off group leaves `undefined` behind in the draft, and
      // `undefined` is not a JSON value: normalizing drops those keys instead
      // of sending them.
      await rpc.call("execution_save", {
        scope,
        value: normalizeExecution(draft),
      });
      await load();
      setSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const controls = (
    <div className="pf-exec-rows">
      <div className="pf-exec-row">
        <Switch
          checked={modelOn}
          label={t("Свой провайдер и модель")}
          onChange={(on) => {
            setModelOn(on);
            patch(
              on
                ? {
                    providerId: shownModel.providerId || undefined,
                    model: shownModel.model || undefined,
                    reasoningLevel: shownModel.reasoningLevel,
                    serviceTier: shownModel.serviceTier,
                  }
                : {
                    providerId: undefined,
                    model: undefined,
                    reasoningLevel: undefined,
                    serviceTier: undefined,
                  },
            );
          }}
        />
        <div className="pf-exec-text">
          <span>{t("Свой провайдер и модель")}</span>
          {!modelOn && (
            <span className="pf-exec-from">
              {originLabel(inheritedModel?.origin, scope)}
            </span>
          )}
        </div>
        <ProviderModelPicker
          value={shownModel}
          disabled={!modelOn}
          routing={routing}
          align="end"
          onChange={(value) => {
            // A disabled picker still reconciles its own catalog and reports
            // the result; that is not the user pinning anything here.
            if (!modelOn) return;
            patch({
              providerId: value.providerId,
              model: value.model,
              reasoningLevel: value.reasoningLevel,
              serviceTier: value.serviceTier,
            });
          }}
        />
      </div>
      <div className="pf-exec-row">
        <Switch
          checked={!!draft.permissionMode}
          label={t("Свой режим доступа")}
          onChange={(on) =>
            patch({ permissionMode: on ? shownPermission : undefined })
          }
        />
        <div className="pf-exec-text">
          <span>{t("Свой режим доступа")}</span>
          {!draft.permissionMode && (
            <span className="pf-exec-from">
              {originLabel(state.inherited.permissionMode?.origin, scope)}
            </span>
          )}
        </div>
        <PermissionModePicker
          providerId={shownModel.providerId}
          value={shownPermission}
          disabled={!draft.permissionMode}
          routing={routing}
          onChange={(value) => {
            if (!draft.permissionMode) return;
            patch({ permissionMode: value });
          }}
        />
      </div>
      <div className="pf-exec-row">
        <Switch
          checked={!!draft.environmentMode}
          label={t("Своя среда")}
          onChange={(on) =>
            patch({ environmentMode: on ? shownEnvironment : undefined })
          }
        />
        <div className="pf-exec-text">
          <span>{t("Своя среда")}</span>
          {!draft.environmentMode &&
            state.inherited.environment?.origin && (
              <span className="pf-exec-from">
                {originLabel(state.inherited.environment.origin, scope)}
              </span>
            )}
        </div>
        <select
          className="pf-select"
          aria-label={t("Своя среда")}
          disabled={!draft.environmentMode || busy}
          value={shownEnvironment}
          onChange={(e) => {
            if (!draft.environmentMode) return;
            patch({ environmentMode: e.target.value as EnvironmentMode });
          }}
        >
          <option value="folder">{t("В папке")}</option>
          <option value="worktree">{t("Отдельный worktree")}</option>
        </select>
      </div>
      <div className="pf-exec-row">
        <Switch
          checked={!!draft.hostId}
          label={t("Своя машина")}
          onChange={(on) =>
            patch({ hostId: on ? seedHostId : undefined })
          }
        />
        <div className="pf-exec-text">
          <span>{t("Своя машина")}</span>
          {!draft.hostId && state.inherited.machine?.origin && (
            <span className="pf-exec-from">
              {originLabel(state.inherited.machine.origin, scope)}
            </span>
          )}
        </div>
        <select
          className="pf-select"
          aria-label={t("Своя машина")}
          disabled={!draft.hostId || busy || state.hosts.length === 0}
          value={shownMachine}
          onChange={(e) => {
            if (!draft.hostId) return;
            patch({ hostId: e.target.value || undefined });
          }}
        >
          {state.hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {labelOf(h.id)}
            </option>
          ))}
          {shownMachine &&
            !state.hosts.some((h) => h.id === shownMachine) && (
              <option value={shownMachine}>{labelOf(shownMachine)}</option>
            )}
        </select>
      </div>
      {scope.kind !== "global" && (
        <div className="pf-exec-row">
          <div className="pf-exec-text pf-exec-text-switchless">
            <span>{t("Агент")}</span>
            <span className="pf-exec-from">
              {draft.agentMode
                ? ""
                : originLabel(state.effective.agent?.origin, scope)}
            </span>
          </div>
          <select
            className="pf-select"
            aria-label={t("Агент")}
            disabled={!agentsUsable || busy}
            value={agentValue}
            onChange={(e) =>
              patch(
                e.target.value === INHERIT
                  ? { agentMode: undefined, agentId: undefined }
                  : e.target.value === NO_AGENT
                    ? { agentMode: "none", agentId: undefined }
                    : { agentMode: "agent", agentId: e.target.value },
              )
            }
          >
            <option value={INHERIT}>{t("Наследовать")}</option>
            <option value={NO_AGENT}>{t("Без агента")}</option>
            {state.agents.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id}
              </option>
            ))}
            {/* A pinned agent the machine no longer lists stays selectable
                until it is changed, instead of silently becoming "Inherit". */}
            {draft.agentMode === "agent" &&
              draft.agentId &&
              !state.agents.agents.some((a) => a.id === draft.agentId) && (
                <option value={draft.agentId}>{draft.agentId}</option>
              )}
          </select>
        </div>
      )}
      {scope.kind !== "global" && !agentsUsable && (
        <p className="pf-agents-hint">
          {!state.agents.installed
            ? t(
                "Выбор агента даёт плагин CLI Agents. Без него провайдер и модель работают как обычно.",
              )
            : state.agents.error ||
              t("У этого CLI нет своих агентов: Claude Code, Codex, OpenCode.")}
        </p>
      )}
      <div className="pf-agents-actions">
        <Button disabled={busy} onClick={() => void save()}>
          <Icon name={saved ? "CircleCheck" : "Settings"} />
          {saved ? t("Сохранено") : t("Сохранить")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
  return aside ? (
    <div className="pf-exec-split">
      {controls}
      {aside}
    </div>
  ) : (
    controls
  );
}

/** The agents column: the picker's own plugin, and what it adds. */
export function CliAgentsCard({ installed }: { installed: boolean }) {
  return (
    <aside className="pf-exec-aside">
      <h4>{t("Агенты для чатов")}</h4>
      <p>
        {installed
          ? t(
              "Плагин CLI Agents установлен. Агент выбирается у проекта или раздела: откройте его карточку и задайте агента рядом с моделью.",
            )
          : t(
              "Чтобы новый чат сразу начинался нужным агентом Claude Code, Codex или OpenCode, поставьте плагин CLI Agents.",
            )}
      </p>
      {!installed && (
        <>
          <code>bb plugin install {CLI_AGENTS_URL}.git --yes</code>
          <p className="pf-exec-aside-note">
            {t("Он же есть в каталоге плагинов BB под именем")} CLI Agents.
          </p>
        </>
      )}
      <UrlLink href={CLI_AGENTS_URL} className="pf-exec-aside-link">
        <Icon name="ExternalLink" />
        {t("Открыть страницу плагина")}
      </UrlLink>
    </aside>
  );
}

/** The plugin-wide default, on the settings page. */
export function ExecutionSettings() {
  const rpc = useRpc<typeof rpcContract>();
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    let live = true;
    rpc
      .call("execution_agents", {
        scope: { kind: "global" },
        providerId: "claude-code",
      })
      .then((r) => {
        if (live) setInstalled((r as AgentCatalog).installed);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [rpc]);
  return (
    <ExecutionEditor
      scope={{ kind: "global" }}
      aside={<CliAgentsCard installed={installed} />}
    />
  );
}
