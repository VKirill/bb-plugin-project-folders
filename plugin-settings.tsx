import { useState, type ReactNode } from "react";
import { LanguagePicker, t } from "./i18n";
import { Icon } from "./components/ui/icon";
import { ChatSettings } from "./chat-settings";
import { AppearanceSettings, TransferSettings } from "./appearance";
import { AgentsMarkersHint, AgentsRulesEditor } from "./agents-apply";
import { ExecutionSettings } from "./execution-ui";
import { SettingRow, SettingsGroup } from "./settings-ui";
import {
  SessionPolicyEditor,
  useSessionPolicyAvailable,
} from "./session-policy-ui";

export const SETTINGS_SECTIONS = [
  "list",
  "appearance",
  "rules",
  "execution",
  "session",
  "archive",
  "transfer",
  "language",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export const isSettingsSection = (v: string): v is SettingsSection =>
  (SETTINGS_SECTIONS as readonly string[]).includes(v);

const meta = (section: SettingsSection) =>
  ({
    list: {
      icon: "ListTodo",
      title: t("Список чатов"),
      hint: t("Порядок чатов, сворачивание разделов и вид дерева."),
    },
    appearance: {
      icon: "Palette",
      title: t("Оформление"),
      hint: t("Иконки, цвета и заливка проектов и разделов."),
    },
    rules: {
      icon: "FileText",
      title: t("Правила AGENTS.md"),
      hint: t("Шаблоны и свои правила для новых проектов и разделов."),
    },
    execution: {
      icon: "Bot",
      title: t("Провайдер и агент"),
      hint: t("С чего начинается новый чат, если проект и раздел молчат."),
    },
    session: {
      icon: "Layers",
      title: t("Контекст сессии"),
      hint: t("Какие плагины, навыки и MCP получает сессия агента."),
    },
    archive: {
      icon: "Archive",
      title: t("Архив разделов"),
      hint: t("Заархивированные разделы с историей чатов."),
    },
    language: {
      icon: "Globe",
      title: t("Язык"),
      hint: t("Язык интерфейса плагина."),
    },
    transfer: {
      icon: "Download",
      title: t("Импорт и экспорт"),
      hint: t("Перенос настроек, оформления и всех данных плагина через файл."),
    },
  })[section];

/** The list of settings sections; the host decides where it sits. */
export function SettingsNav({
  value,
  onChange,
  variant,
}: {
  value: SettingsSection | null;
  onChange: (section: SettingsSection) => void;
  variant: "rail" | "side";
}) {
  // Session context rules need an experimental BB core; hide them elsewhere.
  const sessionPolicyAvailable = useSessionPolicyAvailable();
  return (
    <ul className={`pf-snav pf-snav-${variant}`} role="list">
      {SETTINGS_SECTIONS.filter(
        (id) => id !== "session" || sessionPolicyAvailable,
      ).map((id) => {
        const m = meta(id);
        return (
          <li key={id}>
            <button
              type="button"
              className={"pf-snav-item" + (value === id ? " pf-selected" : "")}
              aria-current={value === id ? "page" : undefined}
              onClick={() => onChange(id)}
            >
              <Icon name={m.icon} />
              <span>{m.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** One settings section with its heading. */
export function SettingsPane({
  section,
  archive,
}: {
  section: SettingsSection;
  /** The archive list lives in the app bundle; the host passes it in. */
  archive: ReactNode;
}) {
  const m = meta(section);
  return (
    <section className="pf-spane" aria-labelledby={`pf-spane-${section}`}>
      <header className="pf-spane-header">
        <h2 id={`pf-spane-${section}`}>{m.title}</h2>
        <p>{m.hint}</p>
      </header>
      {section === "list" && <ChatSettings />}
      {section === "appearance" && <AppearanceSettings />}
      {section === "rules" && (
        <>
          <SettingsGroup
            title={t("Как это работает")}
            hint={t(
              "Раздел любого уровня может задать свой шаблон в диалоге «Правила». У групп правил нет.",
            )}
          >
            <AgentsMarkersHint />
          </SettingsGroup>
          <SettingsGroup title={t("Правила по умолчанию")}>
            <AgentsRulesEditor />
          </SettingsGroup>
        </>
      )}
      {section === "execution" && (
        <SettingsGroup
          title={t("По умолчанию для новых чатов")}
          hint={t(
            "Действует, пока проект или раздел не задал своё. Выключенная группа оставляет обычный выбор BB.",
          )}
        >
          <ExecutionSettings />
        </SettingsGroup>
      )}
      {section === "session" && (
        <SettingsGroup
          title={t("По умолчанию для всех проектов")}
          hint={t(
            "Действует, пока проект или раздел не задал своё. Группа «Наследовать» оставляет обычную загрузку BB.",
          )}
        >
          <SessionPolicyEditor scope={{ kind: "global" }} />
        </SettingsGroup>
      )}
      {section === "archive" && archive}
      {section === "transfer" && <TransferSettings />}
      {section === "language" && (
        <div className="pf-sgroup">
          <SettingRow
            label={t("Язык")}
            hint={t("Хранится в этом браузере. По умолчанию — English.")}
          >
            <LanguagePicker />
          </SettingRow>
        </div>
      )}
    </section>
  );
}

/**
 * Stand-alone settings with their own section rail, for the plugin page in
 * BB settings. The management page places `SettingsNav` in its tree sidebar.
 */
export function PluginSettings({ archive }: { archive: ReactNode }) {
  const [section, setSection] = useState<SettingsSection>("list");
  return (
    <div className="pf-settings-rail">
      <nav aria-label={t("Настройки плагина")}>
        <SettingsNav value={section} onChange={setSection} variant="rail" />
      </nav>
      <SettingsPane section={section} archive={archive} />
    </div>
  );
}
