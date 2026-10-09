import { useEffect, useState, type ReactNode } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { t } from "./i18n";
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import { AGENTS_BLOCK_END, AGENTS_BLOCK_START } from "./agents-template";

type ApplyResult = {
  updated: number;
  unchanged: number;
  failed: number;
  error: string | null;
};

export function AgentsApply() {
  const rpc = useRpc<typeof rpcContract>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState("");
  const run = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await rpc.call("agents_apply", null));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pf-agents-apply">
      <Button variant="outline" disabled={busy} onClick={() => void run()}>
        <Icon name="FolderSync" />
        {busy ? t("Применяю…") : t("Применить к существующим разделам")}
      </Button>
      {result && (
        <p className="pf-agents-result">
          {t("Обновлено")}: {result.updated} · {t("без изменений")}:{" "}
          {result.unchanged} · {t("с ошибками")}: {result.failed}
          {result.error ? ` — ${result.error}` : ""}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

export function AgentsRulesEditor() {
  const rpc = useRpc<typeof rpcContract>();
  const [config, setConfig] = useState<{
    autoCreate: boolean;
    template: string;
    projectTemplate: string;
    custom: string;
    customTarget: "file" | "session" | "both";
    startup: string;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    rpc.call("agents_config", null).then(
      (c) => {
        if (live) setConfig(c);
      },
      (e) => {
        if (live) setError(String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [rpc]);
  if (!config)
    return error ? (
      <p role="alert" className="text-destructive text-sm">
        {error}
      </p>
    ) : null;
  const save = async () => {
    if (!config) return;
    setBusy(true);
    setError("");
    try {
      setConfig(await rpc.call("agents_config_save", config));
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const patch = (value: Partial<typeof config>) => {
    setConfig({ ...config, ...value });
    setDirty(true);
    setSaved(false);
  };
  return (
    <div className="pf-agents-editor">
      <label className="pf-agents-toggle">
        <input
          type="checkbox"
          checked={config.autoCreate}
          disabled={busy}
          onChange={(e) => patch({ autoCreate: e.target.checked })}
        />
        {t("Автосоздание AGENTS.md")}
      </label>
      <label className="pf-agents-field">
        {t("Шаблон проектов")}
        <textarea
          className="pf-rules"
          rows={5}
          dir="ltr"
          disabled={busy || !config.autoCreate}
          value={config.projectTemplate}
          onChange={(e) => patch({ projectTemplate: e.target.value })}
        />
      </label>
      <label className="pf-agents-field">
        {t("Шаблон разделов")}
        <textarea
          className="pf-rules"
          rows={5}
          dir="ltr"
          disabled={busy || !config.autoCreate}
          value={config.template}
          onChange={(e) => patch({ template: e.target.value })}
        />
      </label>
      <div className="pf-agents-field">
        <span className="pf-agents-label">
          {t("Свои правила")}
          <Help
            text={t(
              "Постоянные правила этого места: роутинг моделей, делегирование, порядок работы. «В файл» дописывает их в конец AGENTS.md и CLAUDE.md — они действуют и в консоли на машине. «В сессии BB» ничего не пишет на диск: текст попадает в инструкции агента, запущенного из BB, и действует весь разговор.",
            )}
          />
        </span>
        <textarea
          className="pf-rules"
          rows={4}
          dir="ltr"
          disabled={busy}
          aria-label={t("Свои правила")}
          value={config.custom}
          onChange={(e) => patch({ custom: e.target.value })}
        />
      </div>
      <label className="pf-agents-target">
        {t("Куда применять")}
        <select
          className="pf-select"
          disabled={busy}
          value={config.customTarget}
          onChange={(e) =>
            patch({
              customTarget: e.target.value as typeof config.customTarget,
            })
          }
        >
          <option value="file">{t("В файл")}</option>
          <option value="session">{t("В сессии BB")}</option>
          <option value="both">{t("И туда и туда")}</option>
        </select>
      </label>
      <div className="pf-agents-field">
        <span className="pf-agents-label">
          {t("Стартовое поручение")}
          <Help
            text={t(
              "Одноразовый текст: дописывается к первому сообщению нового чата в этой папке — например «запусти скилл и пришли текущие задачи». В файлы не пишется, в следующих ходах не участвует и в инструкциях сессии не висит.",
            )}
          />
        </span>
        <textarea
          className="pf-rules"
          rows={3}
          dir="ltr"
          disabled={busy}
          aria-label={t("Стартовое поручение")}
          value={config.startup}
          onChange={(e) => patch({ startup: e.target.value })}
        />
      </div>
      <p className="pf-agents-hint">
        {t(
          "Необязательно: роутинг моделей, делегирование в Tasks или Агентство, другие индивидуальные правила. Действуют во всём дереве, пока не переопределены в проекте или разделе.",
        )}
      </p>
      <div className="pf-agents-actions">
        <Button disabled={busy || !dirty} onClick={() => void save()}>
          <Icon name={saved && !dirty ? "CircleCheck" : "Settings"} />
          {saved && !dirty ? t("Сохранено") : t("Сохранить")}
        </Button>
        <AgentsApply />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

export type RuleDraft = {
  mode: "manual" | "inherit" | "custom";
  sectionTemplate: string;
  projectTemplate: string;
  custom: string;
  /** Where custom rules apply: the files, BB sessions, or both. */
  customTarget: "file" | "session" | "both";
  /** One-shot text added to the first message of a new chat here. */
  startup: string;
};

/** A "?" next to a heading; the bubble opens on hover and on keyboard focus. */
export function Help({ text }: { text: string }) {
  return (
    <button type="button" className="pf-help" aria-label={text}>
      ?<span className="pf-help-bubble">{text}</span>
    </button>
  );
}

/** The per-project/per-section rules editor shared by the details pane and the rules dialog. */
export function RuleFields({
  draft,
  onChange,
  showProject,
  namePrefix,
  fileSlot,
  customNote,
}: {
  draft: RuleDraft;
  onChange: (patch: Partial<RuleDraft>) => void;
  showProject: boolean;
  namePrefix: string;
  /** The AGENTS.md / CLAUDE.md editors shown on the "own file" tab. */
  fileSlot?: ReactNode;
  /** Shown above the fields of the "custom template" tab. */
  customNote?: ReactNode;
}) {
  // The open tab is the mode: switching tabs switches what the folder uses.
  const tab = (mode: RuleDraft["mode"], label: string) => (
    <button
      type="button"
      role="tab"
      id={`${namePrefix}-mode-${mode}`}
      aria-selected={draft.mode === mode}
      className={"pf-tab" + (draft.mode === mode ? " pf-selected" : "")}
      onClick={() => onChange({ mode })}
    >
      {label}
    </button>
  );
  const extras = (
    <div className="pf-agents-extra">
      <div className="pf-agents-field">
        <div className="pf-agents-labelrow">
          <span className="pf-agents-label">
            {t("Свои правила")}
            <Help
              text={t(
                "Постоянные правила этого места: роутинг моделей, делегирование, порядок работы. «В файл» дописывает их в конец AGENTS.md и CLAUDE.md — они действуют и в консоли на машине. «В сессии BB» ничего не пишет на диск: текст попадает в инструкции агента, запущенного из BB, и действует весь разговор.",
              )}
            />
          </span>
          {draft.mode === "manual" ? (
            <span className="pf-agents-target pf-agents-fixed">
              {t("Куда применять")}: {t("только в сессии BB")}
              <Help
                text={t(
                  "В режиме «Свой файл» плагин не пишет в файлы, поэтому свои правила действуют только в сессиях, запущенных из BB.",
                )}
              />
            </span>
          ) : (
            <label className="pf-agents-target">
              {t("Куда применять")}
              <select
                className="pf-select"
                value={draft.customTarget}
                onChange={(e) =>
                  onChange({
                    customTarget: e.target.value as RuleDraft["customTarget"],
                  })
                }
              >
                <option value="file">{t("В файл")}</option>
                <option value="session">{t("В сессии BB")}</option>
                <option value="both">{t("В файл и в сессию BB")}</option>
              </select>
            </label>
          )}
        </div>
        <textarea
          className="pf-rules pf-rules-grow"
          rows={2}
          dir="ltr"
          aria-label={t("Свои правила")}
          placeholder={t(
            "Например: отвечай по-русски, коммиты — по Conventional Commits",
          )}
          value={draft.custom}
          onChange={(e) => onChange({ custom: e.target.value })}
        />
      </div>
      <div className="pf-agents-field">
        <span className="pf-agents-label">
          {t("Стартовое поручение")}
          <Help
            text={t(
              "Одноразовый текст: дописывается к первому сообщению нового чата в этой папке — например «запусти скилл и пришли текущие задачи». В файлы не пишется, в следующих ходах не участвует и в инструкциях сессии не висит.",
            )}
          />
        </span>
        <textarea
          className="pf-rules pf-rules-grow"
          rows={2}
          dir="ltr"
          aria-label={t("Стартовое поручение")}
          placeholder={t("Например: запусти скилл и пришли текущие задачи")}
          value={draft.startup}
          onChange={(e) => onChange({ startup: e.target.value })}
        />
      </div>
    </div>
  );
  return (
    <>
      <div
        className="pf-tabs"
        role="tablist"
        aria-label={t("Правила AGENTS.md")}
      >
        {tab("inherit", t("По умолчанию"))}
        {tab("custom", t("Свой шаблон"))}
        {tab("manual", t("Свой файл"))}
      </div>
      <div role="tabpanel" aria-labelledby={`${namePrefix}-mode-${draft.mode}`}>
        {draft.mode === "manual" && (
          <>
            <p className="pf-agents-hint">
              {t(
                "Файлы ведёте вы: плагин не дописывает в них ни шаблон, ни свои правила.",
              )}
            </p>
            {fileSlot}
          </>
        )}
        {draft.mode === "inherit" && (
          <>
            <p className="pf-agents-hint">
              {t("Шаблон берётся из настроек плагина.")}
            </p>
          </>
        )}
        {draft.mode === "custom" && (
          <>
            {customNote}
            {showProject && (
              <label className="pf-agents-field">
                {t("Шаблон проектов")}
                <textarea
                  className="pf-rules pf-rules-grow"
                  rows={3}
                  dir="ltr"
                  value={draft.projectTemplate}
                  onChange={(e) =>
                    onChange({ projectTemplate: e.target.value })
                  }
                />
              </label>
            )}
            <label className="pf-agents-field">
              {t("Шаблон разделов")}
              <textarea
                className="pf-rules pf-rules-grow"
                rows={3}
                dir="ltr"
                value={draft.sectionTemplate}
                onChange={(e) => onChange({ sectionTemplate: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
      {extras}
    </>
  );
}

/** How the managed block is written: shown above the shared rules editor. */
export function AgentsMarkersHint() {
  return (
    <div className="pf-agents-section">
      <p className="pf-agents-hint">
        {t(
          "Проекты получают шаблон проектов, разделы любого уровня — шаблон разделов. Текст вписывается в конец AGENTS.md между служебными метками; текст выше меток не меняется.",
        )}
      </p>
      <pre className="pf-agents-preview" dir="ltr">
        {AGENTS_BLOCK_START}
        {"\n···\n"}
        {AGENTS_BLOCK_END}
      </pre>
    </div>
  );
}
