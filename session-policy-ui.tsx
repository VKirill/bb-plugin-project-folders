import { useCallback, useEffect, useMemo, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { SessionScope as ExecutionScope, rpcContract } from "./server";
import {
  BUILT_IN_SESSION_ITEMS,
  isRequiredSessionItem,
  normalizeSessionPolicy,
  PINNED_SESSION_ITEMS,
  SESSION_POLICY_GROUPS,
  type PolicyOrigin,
  type ResolvedSessionPolicy,
  type SessionFilter,
  type SessionPolicy,
  type SessionPolicyGroup,
} from "./session-policy";
import { t, useLanguage } from "./i18n";
import { Button } from "./components/ui/button";
import { Checkbox } from "./components/ui/checkbox";
import { Icon } from "./components/ui/icon";
import { Input } from "./components/ui/input";
import { errorText } from "./error-text";

type Loaded = {
  own: SessionPolicy;
  /** Skill → the places it is bound to: above (on here) or elsewhere (off here). */
  boundAbove?: Record<string, string[]>;
  boundElsewhere?: Record<string, string[]>;
  userInstructionsFile: { path: string; exists: boolean };
  inherited: ResolvedSessionPolicy;
  effective: ResolvedSessionPolicy;
};
type Adds = {
  /** Core says no rule can leave this plugin out. */
  required?: boolean;
  instructions: boolean;
  configure: boolean;
  tools: number;
  skills: number;
};
type InventoryItem = {
  name: string;
  label: string;
  /** For skills: where the Agent tools plugin files it, when installed. */
  category?: { path: string[]; pathEn: string[]; order: number };
  /** A BB built-in plugin or its skill: no rule can leave it out. */
  required?: boolean;
  /** A skill of a plugin the owner pinned. */
  pinned?: boolean;
  adds?: Adds;
};
type Inventory = Partial<Record<SessionPolicyGroup, InventoryItem[]>>;

/** "instructions · tools: 3 · skills: 2", or that the plugin adds nothing. */
function addsLabel(adds: Adds): string {
  const parts = [
    ...(adds.instructions ? [t("инструкции")] : []),
    ...(adds.tools > 0
      ? [t("инструменты: {n}").replace("{n}", String(adds.tools))]
      : []),
    ...(adds.skills > 0
      ? [t("навыки: {n}").replace("{n}", String(adds.skills))]
      : []),
    ...(adds.configure ? [t("выбирает по треду")] : []),
  ];
  return parts.length > 0
    ? parts.join(" · ")
    : t("в сессию ничего не добавляет");
}
const INHERIT = "__inherit";

/**
 * Whether the running BB can enforce session rules. Asked once per page:
 * the answer only changes when BB itself is replaced.
 */
let availability: Promise<boolean> | null = null;
export function useSessionPolicyAvailable(): boolean {
  const rpc = useRpc<typeof rpcContract>();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    availability ??= rpc
      .call("session_policy_capability", null)
      .then((r) => (r as { available: boolean }).available)
      .catch(() => {
        availability = null;
        return false;
      });
    void availability.then((value) => {
      if (live) setAvailable(value);
    });
    return () => {
      live = false;
    };
  }, [rpc]);
  return available;
}

const groupMeta = (group: SessionPolicyGroup) =>
  ({
    bbPlugins: {
      title: t("Плагины BB"),
      hint: t(
        "Инструкции, инструменты и навыки плагинов BB. Исключённый плагин здесь не показывает свои кнопки в поле ввода и не перехватывает сообщения.",
      ),
    },
    skills: {
      title: t("Навыки"),
      hint: t("Навыки BB и собственные навыки CLI по имени."),
    },
    mcpServers: {
      title: t("MCP-серверы"),
      hint: t("Серверы из настроек CLI на машине."),
    },
    nativePlugins: {
      title: t("Плагины CLI"),
      hint: t("Плагины Claude Code и Codex."),
    },
  })[group];

function originLabel(origin: PolicyOrigin | undefined, scope: ExecutionScope) {
  if (!origin) return t("по умолчанию BB");
  if (origin.scope === "global") return t("из настроек плагина");
  if (origin.scope === "subthreads") return t("из правила для сабтредов");
  if (origin.scope === "project") return t("из проекта");
  return scope.kind === "folder" && origin.folderId === scope.folderId
    ? t("отсюда")
    : t("из раздела выше");
}

function modeLabel(filter: SessionFilter | undefined) {
  if (!filter || filter.mode === "all") return t("Все");
  if (filter.mode === "adjust")
    return t("Как выше, с изменениями: +{on} −{off}")
      .replace("{on}", String(filter.enable?.length ?? 0))
      .replace("{off}", String(filter.names.length));
  return filter.mode === "allow"
    ? t("Только выбранные: {n}").replace("{n}", String(filter.names.length))
    : t("Все, кроме: {n}").replace("{n}", String(filter.names.length));
}

/**
 * What an agent session started here loads: BB plugins, skills, MCP servers
 * and CLI plugins. Every group inherits until it is set here, like the
 * provider and model defaults next to it.
 */
export function SessionPolicyEditor({ scope }: { scope: ExecutionScope }) {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<SessionPolicy>({});
  const [inventory, setInventory] = useState<Inventory>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const key =
    scope.kind === "folder"
      ? `f:${scope.folderId}`
      : scope.kind === "project"
        ? `p:${scope.projectId}`
        : scope.kind === "subthreads"
          ? "s"
          : "g";
  const load = useCallback(async () => {
    const value = (await rpc.call("session_policy_read", { scope })) as Loaded;
    setState(value);
    setDraft(value.own);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc, key]);
  useEffect(() => {
    let live = true;
    setState(null);
    setError("");
    setSaved(false);
    load().catch((e) => {
      if (live) setError(errorText(e));
    });
    rpc
      .call("session_policy_inventory", { scope })
      .then((r) => {
        if (live) setInventory(r as Inventory);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);
  if (error && !state)
    return (
      <p role="alert" className="text-destructive text-sm">
        {error}
      </p>
    );
  if (!state) return <p className="pf-agents-hint">{t("Загрузка…")}</p>;

  const patch = (next: Partial<SessionPolicy>) => {
    setDraft((current) => ({ ...current, ...next }));
    setSaved(false);
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await rpc.call("session_policy_save", {
        scope,
        value: normalizeSessionPolicy(draft),
      });
      await load();
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pf-exec-rows pf-session-rows">
      {SESSION_POLICY_GROUPS.map((group) => (
        <GroupRow
          key={group}
          group={group}
          scope={scope}
          own={draft[group]}
          inherited={state.inherited[group]}
          items={inventory[group] ?? []}
          disabled={busy}
          onChange={(value) => patch({ [group]: value })}
          bound={
            group === "skills"
              ? {
                  here: draft.onlyHere ?? [],
                  above: state.boundAbove ?? {},
                  elsewhere: state.boundElsewhere ?? {},
                }
              : undefined
          }
        />
      ))}
      {scope.kind !== "global" && scope.kind !== "subthreads" && (
        <BoundSkills
          here={draft.onlyHere ?? []}
          above={state.boundAbove ?? {}}
          items={inventory.skills ?? []}
          disabled={busy}
          onChange={(onlyHere) => patch({ onlyHere })}
        />
      )}
      <SwitchRow
        title={t("Общие инструкции BB")}
        hint={
          t("Файл {path}: BB добавляет его текст в каждую сессию.").replace(
            "{path}",
            state.userInstructionsFile.path,
          ) +
          (state.userInstructionsFile.exists
            ? ""
            : ` ${t("Сейчас этого файла нет, выключать нечего.")}`)
        }
        own={draft.userInstructions}
        inherited={state.inherited.userInstructions}
        scope={scope}
        disabled={busy}
        onChange={(value) => patch({ userInstructions: value })}
      />
      <SwitchRow
        title={t("Инструкции проекта")}
        hint={t(
          "AGENTS.md и CLAUDE.md в папке раздела и выше, а также .bb/AGENTS.md. Claude Code и Codex отключают их полностью, OpenCode — вместе со своими настройками проекта, Cursor не отключает.",
        )}
        own={draft.projectInstructions}
        inherited={state.inherited.projectInstructions}
        scope={scope}
        disabled={busy}
        onChange={(value) => patch({ projectInstructions: value })}
      />
      <SwitchRow
        title={t("Навыки и плагины из claude.ai")}
        hint={t(
          "То, что Claude Code подтягивает из аккаунта claude.ai (anthropic-skills:…). Действует только в Claude Code.",
        )}
        own={draft.claudeAiSync}
        inherited={state.inherited.claudeAiSync}
        scope={scope}
        disabled={busy}
        onChange={(value) => patch({ claudeAiSync: value })}
      />
      <p className="pf-agents-hint">
        {t(
          "Действует для новых сессий. Claude Code и Codex соблюдают все группы, OpenCode — всё, кроме плагинов CLI, Cursor — плагины BB и MCP-серверы.",
        )}
      </p>
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
}

/** One on/off switch that inherits until it is set here. */
function SwitchRow({
  title,
  hint,
  own,
  inherited,
  scope,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  own: boolean | undefined;
  inherited: { value: boolean; origin: PolicyOrigin } | null;
  scope: ExecutionScope;
  disabled: boolean;
  onChange: (value: boolean | undefined) => void;
}) {
  return (
    <div className="pf-exec-row">
      <div className="pf-exec-text pf-exec-text-switchless">
        <span>{title}</span>
        <span className="pf-exec-from">
          {hint}
          {own === undefined &&
            ` · ${inherited?.value === false ? t("Не подключать") : t("Подключать")} · ${originLabel(inherited?.origin, scope)}`}
        </span>
      </div>
      <select
        className="pf-select"
        aria-label={title}
        disabled={disabled}
        value={own === undefined ? INHERIT : own ? "on" : "off"}
        onChange={(e) =>
          onChange(
            e.target.value === INHERIT ? undefined : e.target.value === "on",
          )
        }
      >
        <option value={INHERIT}>{t("Наследовать")}</option>
        <option value="on">{t("Подключать")}</option>
        <option value="off">{t("Не подключать")}</option>
      </select>
    </div>
  );
}

function GroupRow({
  group,
  scope,
  own,
  inherited,
  items,
  disabled,
  onChange,
  bound,
}: {
  group: SessionPolicyGroup;
  scope: ExecutionScope;
  own: SessionFilter | undefined;
  inherited: ResolvedSessionPolicy[SessionPolicyGroup];
  items: InventoryItem[];
  disabled: boolean;
  onChange: (value: SessionFilter | undefined) => void;
  /** Skills only: bound skills are locked, on or off by where they are bound. */
  bound?: {
    here: readonly string[];
    above: Record<string, string[]>;
    elsewhere: Record<string, string[]>;
  };
}) {
  const meta = groupMeta(group);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const names = own?.names ?? [];
  const enable = own?.enable ?? [];
  const adjust = own?.mode === "adjust";
  // What the place above loads: `adjust` shows it and changes single items.
  const above = inherited?.value;
  const loadedAbove = (name: string) =>
    !above || above.mode === "all"
      ? true
      : above.mode === "allow"
        ? above.names.includes(name)
        : !above.names.includes(name);
  const loadedHere = (name: string) =>
    enable.includes(name)
      ? true
      : names.includes(name)
        ? false
        : loadedAbove(name);
  const listed = useMemo(() => {
    const known = new Map(items.map((i) => [i.name, i]));
    for (const name of [
      ...(BUILT_IN_SESSION_ITEMS[group] ?? []),
      ...names,
      ...enable,
    ])
      if (!known.has(name)) known.set(name, { name, label: name });
    const q = query.trim().toLowerCase();
    // Required items first, then plugins that actually shape the session.
    const weight = (item: InventoryItem) =>
      isRequiredSessionItem(group, item.name) ||
      item.required ||
      item.adds?.required
        ? 0
        : item.adds &&
            addsLabel(item.adds) !== t("в сессию ничего не добавляет")
          ? 1
          : 2;
    return [...known.values()]
      .filter((item) =>
        q ? `${item.name} ${item.label}`.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => weight(a) - weight(b) || a.label.localeCompare(b.label));
  }, [group, items, names, enable, query]);
  const lang = useLanguage();
  const isRequired = (item: InventoryItem) =>
    isRequiredSessionItem(group, item.name) ||
    item.required === true ||
    item.adds?.required === true;
  // Required items stay in every session: ticked in an allow list (and as
  // loaded in `adjust`), unticked in a deny list, and locked either way.
  const isChecked = (item: InventoryItem) =>
    adjust
      ? isRequired(item) || loadedHere(item.name)
      : isRequired(item)
        ? own?.mode === "allow"
        : names.includes(item.name);
  /** Ticks or unticks several items at once: one item, or a whole section. */
  const setMany = (list: readonly string[], on: boolean) => {
    const touched = new Set(list);
    if (!adjust)
      return onChange({
        mode: own!.mode,
        names: on
          ? [...new Set([...names, ...list])]
          : names.filter((n) => !touched.has(n)),
      });
    // Same as above: no change here. Otherwise record the switch.
    const changed = list.filter((n) => on !== loadedAbove(n));
    onChange({
      mode: "adjust",
      names: [...names.filter((n) => !touched.has(n)), ...(on ? [] : changed)],
      enable: [
        ...enable.filter((n) => !touched.has(n)),
        ...(on ? changed : []),
      ],
    });
  };
  const toggle = (name: string, on: boolean) => setMany([name], on);
  /**
   * Skills grouped by the Agent tools category tree when it is installed:
   * section → subsection → skills, in the tree's order; the rest last.
   */
  const tree = useMemo(() => {
    if (!listed.some((i) => i.category)) return null;
    type Branch = { title: string; order: number; items: InventoryItem[] };
    const sections = new Map<string, Branch & { subs: Map<string, Branch> }>();
    for (const item of listed) {
      const path = item.category
        ? lang === "ru"
          ? item.category.path
          : item.category.pathEn
        : [t("Без раздела")];
      const order = item.category?.order ?? Number.MAX_SAFE_INTEGER;
      const [top, sub] = path as [string, string | undefined];
      let section = sections.get(top);
      if (!section) {
        section = { title: top, order, items: [], subs: new Map() };
        sections.set(top, section);
      }
      section.order = Math.min(section.order, order);
      if (!sub) {
        section.items.push(item);
        continue;
      }
      let branch = section.subs.get(sub);
      if (!branch)
        section.subs.set(sub, (branch = { title: sub, order, items: [] }));
      branch.items.push(item);
    }
    const byOrder = (a: Branch, b: Branch) =>
      a.order - b.order || a.title.localeCompare(b.title);
    return [...sections.values()].sort(byOrder).map((section) => ({
      ...section,
      subs: [...section.subs.values()].sort(byOrder),
    }));
  }, [listed, lang]);
  const open = query.trim() ? true : undefined;
  /** Where a bound skill belongs, or null when it is not bound. */
  const boundNote = (name: string) =>
    !bound
      ? null
      : bound.here.includes(name)
        ? t("только здесь")
        : bound.above[name]
          ? t("только в: {places}").replace(
              "{places}",
              bound.above[name]!.join(", "),
            )
          : bound.elsewhere[name]
            ? t("только в: {places}").replace(
                "{places}",
                bound.elsewhere[name]!.join(", "),
              )
            : null;
  const itemRow = (item: InventoryItem) => {
    const required = isRequired(item);
    const note = boundNote(item.name);
    return (
      <li key={item.name}>
        <label>
          <Checkbox
            checked={
              // Bound skills: loaded here unless bound elsewhere; a deny
              // list ticks what it leaves out.
              note
                ? (own?.mode === "deny") === !!bound!.elsewhere[item.name]
                : isChecked(item)
            }
            disabled={disabled || required || !!note}
            onCheckedChange={(on) => toggle(item.name, on === true)}
          />
          <span className="pf-session-item">
            <span>{item.label}</span>
            {note ? (
              <span className="pf-session-adds">{note}</span>
            ) : required ? (
              <span className="pf-session-adds">
                {PINNED_SESSION_ITEMS.has(item.name) || item.pinned
                  ? t("закреплён, всегда подключён")
                  : t("нужен BB, всегда подключён")}
              </span>
            ) : adjust &&
              (names.includes(item.name) || enable.includes(item.name)) ? (
              <span className="pf-session-adds">{t("изменено здесь")}</span>
            ) : (
              item.adds && (
                <span className="pf-session-adds">{addsLabel(item.adds)}</span>
              )
            )}
          </span>
        </label>
      </li>
    );
  };
  /** A section or subsection: a box for all its items, a count, the items. */
  const branchRow = (
    key: string,
    title: string,
    items: InventoryItem[],
    children: React.ReactNode,
  ) => {
    const free = items.filter((i) => !isRequired(i));
    const on = items.filter(isChecked).length;
    const all = free.length > 0 && free.every(isChecked);
    const some = free.some(isChecked);
    return (
      <li key={key} className="pf-session-branch">
        <details open={open}>
          <summary>
            <span
              className="pf-session-branch-box"
              onClick={(e) => e.preventDefault()}
            >
              <Checkbox
                aria-label={title}
                checked={all ? true : some ? "indeterminate" : false}
                disabled={disabled || free.length === 0}
                onCheckedChange={() =>
                  setMany(
                    free.map((i) => i.name),
                    !all,
                  )
                }
              />
            </span>
            <span className="pf-session-branch-title">{title}</span>
            <span className="pf-session-adds">
              {on}/{items.length}
            </span>
          </summary>
          <ul role="list">{children}</ul>
        </details>
      </li>
    );
  };
  const addCustom = () => {
    const name = custom.trim();
    if (!name || !own || names.includes(name) || enable.includes(name)) return;
    if (adjust) toggle(name, !loadedAbove(name));
    else onChange({ mode: own.mode, names: [...names, name] });
    setCustom("");
  };
  return (
    <div className="pf-session-group">
      <div className="pf-exec-row">
        <div className="pf-exec-text pf-exec-text-switchless">
          <span>{meta.title}</span>
          <span className="pf-exec-from">
            {own
              ? meta.hint
              : `${modeLabel(inherited?.value)} · ${originLabel(inherited?.origin, scope)}`}
          </span>
        </div>
        <select
          className="pf-select"
          aria-label={meta.title}
          disabled={disabled}
          value={own?.mode ?? INHERIT}
          onChange={(e) => {
            const mode = e.target.value;
            onChange(
              mode === INHERIT
                ? undefined
                : mode === "adjust"
                  ? { mode: "adjust", names: [], enable: [] }
                  : {
                      mode: mode as SessionFilter["mode"],
                      names: mode === "all" || adjust ? [] : names,
                    },
            );
          }}
        >
          <option value={INHERIT}>{t("Наследовать")}</option>
          <option value="all">{t("Все")}</option>
          <option value="allow">{t("Только выбранные")}</option>
          <option value="deny">{t("Все, кроме выбранных")}</option>
          {scope.kind !== "global" && (
            <option value="adjust">{t("Как выше, с изменениями")}</option>
          )}
        </select>
      </div>
      {own && own.mode !== "all" && (
        <div className="pf-session-pick">
          <Input
            value={query}
            placeholder={t("Поиск")}
            aria-label={t("Поиск")}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="pf-session-list" role="list">
            {tree
              ? tree.map((section) =>
                  branchRow(
                    section.title,
                    section.title,
                    [...section.items, ...section.subs.flatMap((b) => b.items)],
                    <>
                      {section.subs.map((sub) =>
                        branchRow(
                          `${section.title}/${sub.title}`,
                          sub.title,
                          sub.items,
                          sub.items.map(itemRow),
                        ),
                      )}
                      {section.items.map(itemRow)}
                    </>,
                  ),
                )
              : listed.map(itemRow)}
            {listed.length === 0 && (
              <li className="pf-agents-hint">{t("Ничего не найдено")}</li>
            )}
          </ul>
          <div className="pf-session-add">
            <Input
              value={custom}
              placeholder={t("Имя или шаблон с * на конце")}
              aria-label={t("Добавить имя")}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || !custom.trim()}
              onClick={addCustom}
            >
              {t("Добавить имя")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Skills bound to this place: always loaded in its chats and in no chat
 * elsewhere, whatever any group says. Shown whatever the skills group is set to.
 */
function BoundSkills({
  here,
  above,
  items,
  disabled,
  onChange,
}: {
  here: readonly string[];
  above: Record<string, string[]>;
  items: InventoryItem[];
  disabled: boolean;
  onChange: (value: string[] | undefined) => void;
}) {
  const [name, setName] = useState("");
  const free = items.filter(
    (i) =>
      !i.required &&
      !isRequiredSessionItem("skills", i.name) &&
      !here.includes(i.name),
  );
  const add = () => {
    const n = name.trim();
    if (!n || here.includes(n)) return;
    onChange([...here, n]);
    setName("");
  };
  const fromAbove = Object.keys(above).sort();
  return (
    <div className="pf-session-group">
      <div className="pf-exec-row">
        <div className="pf-exec-text pf-exec-text-switchless">
          <span>{t("Навыки только здесь")}</span>
          <span className="pf-exec-from">
            {t(
              "Подключаются в чатах этого места и вложенных разделов, а в других проектах и разделах выключены, и выбрать их там нельзя.",
            )}
            {fromAbove.length > 0 &&
              ` ${t("Привязаны выше: {names}").replace("{names}", fromAbove.join(", "))}`}
          </span>
        </div>
      </div>
      <div className="pf-session-pick">
        {here.length > 0 && (
          <ul className="pf-session-list" role="list">
            {here.map((n) => (
              <li key={n}>
                <label>
                  <Checkbox
                    checked
                    disabled={disabled}
                    onCheckedChange={() => {
                      const rest = here.filter((x) => x !== n);
                      onChange(rest.length ? rest : undefined);
                    }}
                  />
                  <span className="pf-session-item">
                    <span>{n}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="pf-session-add">
          <Input
            value={name}
            list="pf-bound-skills"
            placeholder={t("Имя навыка")}
            aria-label={t("Привязать навык")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <datalist id="pf-bound-skills">
            {free.map((i) => (
              <option key={i.name} value={i.name} />
            ))}
          </datalist>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !name.trim()}
            onClick={add}
          >
            {t("Привязать навык")}
          </Button>
        </div>
      </div>
    </div>
  );
}
