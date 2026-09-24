import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./components/ui/dropdown-menu";
import { Icon } from "./components/ui/icon";
import { t } from "./i18n";
import { usePrefs } from "./prefs-store";
import type { Prefs } from "./preferences";
import { SettingRow, SettingsGroup, Switch } from "./settings-ui";

type ChatList = Prefs["chatList"];
/** Chat list settings, shared by every device through the plugin server. */
export function useChatSettings() {
  const { prefs, savePrefs } = usePrefs();
  return [
    prefs.chatList,
    (patch: Partial<ChatList>) =>
      void savePrefs({
        ...prefs,
        chatList: { ...prefs.chatList, ...patch },
      }).catch(() => undefined),
  ] as const;
}

function NumberInput({
  id,
  value,
  min,
  max,
  step = 1,
  integer = true,
  disabled,
  onCommit,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  return (
    <input
      id={id}
      className="pf-sinput pf-sinput-number"
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      defaultValue={value}
      key={value}
      onBlur={(e) => {
        const next = Number(e.target.value);
        if (
          Number.isFinite(next) &&
          (!integer || Number.isInteger(next)) &&
          next >= min &&
          next <= max
        ) {
          if (next !== value) onCommit(next);
        } else e.target.value = String(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

export function ChatSettings() {
  const { prefs, savePrefs } = usePrefs();
  const settings = prefs.chatList;
  const update = (patch: Partial<ChatList>) =>
    void savePrefs({ ...prefs, chatList: { ...settings, ...patch } }).catch(
      () => undefined,
    );
  const view = (patch: Partial<Prefs["view"]>) =>
    void savePrefs({ ...prefs, view: { ...prefs.view, ...patch } }).catch(
      () => undefined,
    );
  return (
    <>
      <SettingsGroup
        title={t("Порядок чатов")}
        hint={t(
          "Закреплённые чаты всегда сверху. Для отдельного раздела порядок и число чатов меняются в его «Оформлении».",
        )}
      >
        <SettingRow
          label={t("Стиль отображения чатов")}
          hint={t(
            "Показывать провайдера и текущий статус рядом с названием чата. Обычный вариант оставляет прежний вид списка.",
          )}
          htmlFor="pf-set-thread-display"
        >
          <select
            id="pf-set-thread-display"
            className="pf-sinput"
            value={settings.threadDisplay}
            onChange={(e) =>
              update({
                threadDisplay: e.target.value as ChatList["threadDisplay"],
              })
            }
          >
            <option value="classic">{t("Обычный")}</option>
            <option value="provider-status">{t("Провайдер и статус")}</option>
          </select>
        </SettingRow>
        <SettingRow
          label={t("Поднимать разделы с активными чатами")}
          hint={t(
            "Раздел с непрочитанным ответом поднимается выше всех. Дальше идут разделы, где идёт работа, затем по свежести. Выключено — ручной порядок.",
          )}
          htmlFor="pf-set-section-sort"
        >
          <Switch
            id="pf-set-section-sort"
            label={t("Поднимать разделы с активными чатами")}
            checked={settings.sortSectionsByActivity}
            onChange={(sortSectionsByActivity) =>
              update({ sortSectionsByActivity })
            }
          />
        </SettingRow>
        <SettingRow label={t("Сортировка чатов")} htmlFor="pf-set-sort">
          <select
            id="pf-set-sort"
            className="pf-sinput"
            value={settings.sort}
            onChange={(e) =>
              update({ sort: e.target.value as ChatList["sort"] })
            }
          >
            <option value="activity">{t("По активности")}</option>
            <option value="title">{t("По алфавиту")}</option>
            <option value="created">{t("Сначала новые")}</option>
          </select>
        </SettingRow>
        <SettingRow
          label={t("Чатов в каждом разделе")}
          hint={t("Остальные открываются кнопкой «Показать все».")}
          htmlFor="pf-set-limit"
        >
          <NumberInput
            id="pf-set-limit"
            value={settings.limit}
            min={1}
            max={100}
            onCommit={(limit) => update({ limit })}
          />
        </SettingRow>
        <SettingRow
          label={t("Скрывать чаты без обращения, часов")}
          hint={t(
            "Чаты, к которым не заходили дольше этого времени, прячутся под «Показать все». Ноль — не скрывать по сроку. Закреплённые, непрочитанные и работающие чаты остаются.",
          )}
          htmlFor="pf-set-idle"
        >
          <NumberInput
            id="pf-set-idle"
            value={settings.hideIdleHours}
            min={0}
            max={720}
            step={1}
            onCommit={(hideIdleHours) => update({ hideIdleHours })}
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup title={t("Сворачивание разделов")}>
        <SettingRow
          label={t("Сворачивать неактивные разделы автоматически")}
          hint={t(
            "Раздел открыт, пока в нём работает агент или открыт чат. Свёрнутый вручную раздел остаётся свёрнутым.",
          )}
          htmlFor="pf-set-collapse"
        >
          <Switch
            id="pf-set-collapse"
            label={t("Сворачивать неактивные разделы автоматически")}
            checked={settings.autoCollapseInactive}
            onChange={(autoCollapseInactive) =>
              update({ autoCollapseInactive })
            }
          />
        </SettingRow>
        <SettingRow
          label={
            settings.inactiveUnit === "days"
              ? t("Сворачивать разделы без активности, дней")
              : t("Сворачивать разделы без активности, часов")
          }
          htmlFor="pf-set-hours"
          disabled={!settings.autoCollapseInactive}
        >
          <span className="pf-srow-pair">
            <NumberInput
              id="pf-set-hours"
              value={
                settings.inactiveUnit === "days"
                  ? settings.inactiveHours / 24
                  : settings.inactiveHours
              }
              min={settings.inactiveUnit === "days" ? 1 : 0.25}
              max={settings.inactiveUnit === "days" ? 30 : 720}
              step={settings.inactiveUnit === "days" ? 1 : 0.25}
              integer={settings.inactiveUnit === "days"}
              disabled={!settings.autoCollapseInactive}
              onCommit={(value) =>
                update({
                  inactiveHours:
                    settings.inactiveUnit === "days" ? value * 24 : value,
                })
              }
            />
            <select
              className="pf-sinput"
              aria-label={t("Единицы времени неактивности")}
              disabled={!settings.autoCollapseInactive}
              value={settings.inactiveUnit}
              onChange={(e) => {
                const inactiveUnit = e.target.value as ChatList["inactiveUnit"];
                if (inactiveUnit === settings.inactiveUnit) return;
                if (inactiveUnit === "days") {
                  const days = Math.min(
                    30,
                    Math.max(1, Math.round(settings.inactiveHours / 24) || 1),
                  );
                  update({ inactiveUnit, inactiveHours: days * 24 });
                  return;
                }
                update({ inactiveUnit });
              }}
            >
              <option value="hours">{t("Часы")}</option>
              <option value="days">{t("Дни")}</option>
            </select>
          </span>
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup
        title={t("Вид дерева")}
        hint={t("Настройки общие для всех устройств.")}
      >
        <SettingRow label={t("Плотность списка")} htmlFor="pf-set-density">
          <select
            id="pf-set-density"
            className="pf-sinput"
            value={prefs.view.density}
            onChange={(e) =>
              view({ density: e.target.value as Prefs["view"]["density"] })
            }
          >
            <option value="comfortable">{t("Обычная")}</option>
            <option value="compact">{t("Компактная")}</option>
          </select>
        </SettingRow>
        <SettingRow
          label={t("Отступ вложенных разделов, px")}
          htmlFor="pf-set-indent"
        >
          <NumberInput
            id="pf-set-indent"
            value={prefs.view.indent}
            min={0}
            max={32}
            onCommit={(indent) => view({ indent })}
          />
        </SettingRow>
        <SettingRow
          label={t("Выделять жирным разделы с непрочитанными чатами")}
          htmlFor="pf-set-bold"
        >
          <Switch
            id="pf-set-bold"
            label={t("Выделять жирным разделы с непрочитанными чатами")}
            checked={settings.boldUnread}
            onChange={(boldUnread) => update({ boldUnread })}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

export function ChatSortMenu() {
  const [settings, update] = useChatSettings();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon name="Sort" />
        {t("Сортировка чатов")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={settings.sort}
          onValueChange={(sort) => update({ sort: sort as ChatList["sort"] })}
        >
          <DropdownMenuRadioItem value="activity">
            {t("По активности")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="title">
            {t("По алфавиту")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="created">
            {t("Сначала новые")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function SectionSortMenu() {
  const [settings, update] = useChatSettings();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon name="ArrowUpDown" />
        {t("Сортировка разделов")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={settings.sortSectionsByActivity ? "activity" : "manual"}
          onValueChange={(value) =>
            update({ sortSectionsByActivity: value === "activity" })
          }
        >
          <DropdownMenuRadioItem value="activity">
            {t("Активные сверху")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="manual">
            {t("Ручной порядок")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
