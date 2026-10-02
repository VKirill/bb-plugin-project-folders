import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  AiBrain01Icon,
  Airplane01Icon,
  Analytics01Icon,
  ApiIcon,
  Archive03Icon,
  Award01Icon,
  Baby01Icon,
  BeakerIcon,
  Book02Icon,
  BookOpen01Icon,
  Bookmark01Icon,
  BotIcon,
  Briefcase01Icon,
  BubbleChatIcon,
  Bug01Icon,
  Building03Icon,
  Calendar03Icon,
  Camera01Icon,
  Car01Icon,
  ChartColumnIcon,
  ChartLineData01Icon,
  CheckListIcon,
  ChipIcon,
  Clock01Icon,
  CloudIcon,
  Coffee01Icon,
  Coins01Icon,
  ComputerTerminal01Icon,
  CreditCardIcon,
  Crown02Icon,
  CubeIcon,
  DashboardSquare01Icon,
  DatabaseIcon,
  Diamond01Icon,
  Dollar01Icon,
  Dumbbell01Icon,
  Edit02Icon,
  FavouriteIcon,
  File01Icon,
  Fire02Icon,
  Flag02Icon,
  Folder01Icon,
  Folder02Icon,
  FolderCloudIcon,
  FolderCodeIcon,
  FolderFavouriteIcon,
  FolderIcon,
  FolderLibraryIcon,
  FolderLockedIcon,
  FolderOpenIcon,
  GameController01Icon,
  GitBranchIcon,
  Globe02Icon,
  HealthIcon,
  Home01Icon,
  Hospital01Icon,
  Idea01Icon,
  Image01Icon,
  InboxIcon,
  InstagramIcon,
  Invoice01Icon,
  JusticeScale01Icon,
  KanbanIcon,
  Key01Icon,
  LanguageSquareIcon,
  Layers01Icon,
  Leaf01Icon,
  Link01Icon,
  LockIcon,
  MagicWand01Icon,
  Mail01Icon,
  MapsLocation01Icon,
  Megaphone01Icon,
  Message01Icon,
  Mic01Icon,
  Money01Icon,
  Moon02Icon,
  Mortarboard01Icon,
  MusicNote01Icon,
  News01Icon,
  Note01Icon,
  Package01Icon,
  PaintBoardIcon,
  PenTool01Icon,
  PieChartIcon,
  PinIcon,
  Pizza01Icon,
  Plant01Icon,
  Presentation01Icon,
  PuzzleIcon,
  Robot01Icon,
  Rocket01Icon,
  School01Icon,
  Search01Icon,
  ServerStack01Icon,
  Settings01Icon,
  Shield01Icon,
  ShoppingCart01Icon,
  SmartPhone01Icon,
  SourceCodeIcon,
  SparklesIcon,
  StarIcon,
  StethoscopeIcon,
  Store01Icon,
  Sun03Icon,
  Tag01Icon,
  Target02Icon,
  Task01Icon,
  TelegramIcon,
  TestTube01Icon,
  Tree01Icon,
  UserGroupIcon,
  UserIcon,
  Video01Icon,
  Wallet01Icon,
  Wrench01Icon,
  YoutubeIcon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import { t } from "./i18n";
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { usePrefs } from "./prefs-store";
import { SettingRow, SettingsGroup, Switch } from "./settings-ui";
import type { rpcContract } from "./server";
import {
  COLOR_TOKENS,
  FILLS,
  LEVELS,
  PRESETS,
  colorCss,
  exportPayload,
  folderKey,
  isEmptyItem,
  parseImport,
  presetAppearance,
  projectKey,
  resolveStyle,
  type ChatSort,
  type Fill,
  type ItemStyle,
  type LevelKey,
  type Preset,
  type Style,
} from "./preferences";

export const ICON_GROUPS: {
  label: Parameters<typeof t>[0];
  icons: Record<string, IconSvgElement>;
}[] = [
  {
    label: "Папки",
    icons: {
      Folder: FolderIcon,
      Folder01: Folder01Icon,
      Folder02: Folder02Icon,
      FolderOpen: FolderOpenIcon,
      FolderLibrary: FolderLibraryIcon,
      FolderFavourite: FolderFavouriteIcon,
      FolderCode: FolderCodeIcon,
      FolderCloud: FolderCloudIcon,
      FolderLocked: FolderLockedIcon,
      Layers: Layers01Icon,
      Archive: Archive03Icon,
      Inbox: InboxIcon,
    },
  },
  {
    label: "Работа",
    icons: {
      Briefcase: Briefcase01Icon,
      Building: Building03Icon,
      Home: Home01Icon,
      Store: Store01Icon,
      Target: Target02Icon,
      Rocket: Rocket01Icon,
      Flag: Flag02Icon,
      Award: Award01Icon,
      Idea: Idea01Icon,
      Task: Task01Icon,
      CheckList: CheckListIcon,
      Kanban: KanbanIcon,
      Dashboard: DashboardSquare01Icon,
      Calendar: Calendar03Icon,
      Clock: Clock01Icon,
      Presentation: Presentation01Icon,
    },
  },
  {
    label: "Разработка",
    icons: {
      Code: SourceCodeIcon,
      Terminal: ComputerTerminal01Icon,
      Database: DatabaseIcon,
      Server: ServerStack01Icon,
      Cloud: CloudIcon,
      GitBranch: GitBranchIcon,
      Bug: Bug01Icon,
      Api: ApiIcon,
      Puzzle: PuzzleIcon,
      Cube: CubeIcon,
      Package: Package01Icon,
      Settings: Settings01Icon,
      Wrench: Wrench01Icon,
      Chip: ChipIcon,
      Phone: SmartPhone01Icon,
      Globe: Globe02Icon,
      Link: Link01Icon,
      Shield: Shield01Icon,
      Lock: LockIcon,
      Key: Key01Icon,
    },
  },
  {
    label: "ИИ и контент",
    icons: {
      AiBrain: AiBrain01Icon,
      Bot: BotIcon,
      Robot: Robot01Icon,
      Sparkles: SparklesIcon,
      MagicWand: MagicWand01Icon,
      Pen: PenTool01Icon,
      Edit: Edit02Icon,
      Note: Note01Icon,
      File: File01Icon,
      Book: Book02Icon,
      BookOpen: BookOpen01Icon,
      News: News01Icon,
      Image: Image01Icon,
      Camera: Camera01Icon,
      Video: Video01Icon,
      Music: MusicNote01Icon,
      Mic: Mic01Icon,
      Palette: PaintBoardIcon,
      Language: LanguageSquareIcon,
    },
  },
  {
    label: "Общение и маркетинг",
    icons: {
      Megaphone: Megaphone01Icon,
      Mail: Mail01Icon,
      Chat: BubbleChatIcon,
      Message: Message01Icon,
      Telegram: TelegramIcon,
      Youtube: YoutubeIcon,
      Instagram: InstagramIcon,
      Users: UserGroupIcon,
      User: UserIcon,
      Search: Search01Icon,
      ChartLine: ChartLineData01Icon,
      ChartColumn: ChartColumnIcon,
      PieChart: PieChartIcon,
      Analytics: Analytics01Icon,
    },
  },
  {
    label: "Финансы",
    icons: {
      Money: Money01Icon,
      Wallet: Wallet01Icon,
      CreditCard: CreditCardIcon,
      Cart: ShoppingCart01Icon,
      Invoice: Invoice01Icon,
      Coins: Coins01Icon,
      Dollar: Dollar01Icon,
      Diamond: Diamond01Icon,
      Crown: Crown02Icon,
    },
  },
  {
    label: "Жизнь и хобби",
    icons: {
      School: School01Icon,
      Mortarboard: Mortarboard01Icon,
      Beaker: BeakerIcon,
      TestTube: TestTube01Icon,
      Leaf: Leaf01Icon,
      Tree: Tree01Icon,
      Plant: Plant01Icon,
      Heart: FavouriteIcon,
      Star: StarIcon,
      Fire: Fire02Icon,
      Zap: ZapIcon,
      Sun: Sun03Icon,
      Moon: Moon02Icon,
      Coffee: Coffee01Icon,
      Pizza: Pizza01Icon,
      Game: GameController01Icon,
      Plane: Airplane01Icon,
      Car: Car01Icon,
      Map: MapsLocation01Icon,
      Health: HealthIcon,
      Dumbbell: Dumbbell01Icon,
      Hospital: Hospital01Icon,
      Stethoscope: StethoscopeIcon,
      Legal: JusticeScale01Icon,
      Baby: Baby01Icon,
      Tag: Tag01Icon,
      Bookmark: Bookmark01Icon,
      Pin: PinIcon,
    },
  },
];
const ICONS: Record<string, IconSvgElement> = Object.assign(
  {},
  ...ICON_GROUPS.map((g) => g.icons),
);
const EMOJIS = [
  "📁",
  "📂",
  "🗂️",
  "💼",
  "🏢",
  "🏠",
  "🚀",
  "🎯",
  "⭐",
  "🔥",
  "⚡",
  "💡",
  "🧠",
  "🤖",
  "✨",
  "🛠️",
  "⚙️",
  "🧪",
  "🐛",
  "💻",
  "🖥️",
  "📱",
  "🌐",
  "🔒",
  "📝",
  "📚",
  "📰",
  "🎨",
  "🎬",
  "📷",
  "🎵",
  "🎙️",
  "📣",
  "✉️",
  "💬",
  "👥",
  "📈",
  "📊",
  "💰",
  "💳",
  "🛒",
  "🎓",
  "🌱",
  "❤️",
  "☕",
  "🎮",
  "✈️",
  "🏥",
  "⚖️",
  "🧩",
  "📦",
  "🏷️",
];
/** The first user-perceived character, when it is an emoji. */
export function firstEmoji(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  const first = Segmenter
    ? ([
        ...new Segmenter(undefined, { granularity: "grapheme" }).segment(
          trimmed,
        ),
      ][0]?.segment ?? "")
    : Array.from(trimmed)[0]!;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(first) &&
    first.length <= 16
    ? first
    : null;
}

export function Glyph({
  icon,
  color,
  fill = "none",
}: {
  icon: string;
  color?: string;
  fill?: Fill;
}) {
  const css = colorCss(color);
  const style = (css ? { "--pf-c": css } : undefined) as
    CSSProperties | undefined;
  const cls =
    "pf-glyph" +
    (fill === "badge" ? " pf-glyph-badge" : "") +
    (css ? " pf-glyph-colored" : "");
  if (icon.startsWith("emoji:"))
    return (
      <span className={cls} style={style} aria-hidden="true">
        <span className="pf-emoji">{icon.slice(6)}</span>
      </span>
    );
  const svg = ICONS[icon.slice(5)] ?? FolderIcon;
  return (
    <span className={cls} style={style} aria-hidden="true">
      <HugeiconsIcon icon={svg} strokeWidth={1.8} />
    </span>
  );
}
/** Stripe and row fills decorate the whole heading row. */
export function rowDecoration(style: { color?: string; fill: Fill }) {
  const css = colorCss(style.color);
  return {
    className:
      style.fill === "stripe" || style.fill === "row"
        ? ` pf-row-${style.fill}`
        : "",
    style: (css ? { "--pf-c": css } : undefined) as CSSProperties | undefined,
  };
}

type TreeFolder = {
  id: string;
  parentId: string | null;
  projectId: string;
  kind?: string;
};
/** Effective look of a project root or a section for rendering. */
export function useFolderLook(folders: readonly TreeFolder[]) {
  const { prefs, items } = usePrefs();
  return {
    prefs,
    look: (projectId: string, folder: TreeFolder | null) =>
      resolveStyle({ prefs, items, folders, projectId, folder }),
  };
}

function IconPicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (icon: string) => void;
}) {
  const [emoji, setEmoji] = useState("");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  return (
    <div className="pf-picker">
      <input
        className="pf-picker-search"
        placeholder={t("Поиск иконки")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {ICON_GROUPS.map((group) => {
        const names = Object.keys(group.icons).filter(
          (n) => !q || n.toLowerCase().includes(q),
        );
        if (!names.length) return null;
        return (
          <div key={group.label}>
            <div className="pf-picker-group">{t(group.label)}</div>
            <div className="pf-picker-grid">
              {names.map((name) => (
                <button
                  type="button"
                  key={name}
                  title={name}
                  aria-label={name}
                  aria-pressed={value === `icon:${name}`}
                  className={
                    "pf-picker-cell" +
                    (value === `icon:${name}` ? " pf-selected" : "")
                  }
                  onClick={() => onChange(`icon:${name}`)}
                >
                  <HugeiconsIcon icon={group.icons[name]!} strokeWidth={1.8} />
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {!q && (
        <>
          <div className="pf-picker-group">{t("Эмодзи")}</div>
          <div className="pf-picker-grid">
            {EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                className={
                  "pf-picker-cell pf-emoji-cell" +
                  (value === `emoji:${e}` ? " pf-selected" : "")
                }
                aria-pressed={value === `emoji:${e}`}
                onClick={() => onChange(`emoji:${e}`)}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="pf-emoji-input">
            <input
              placeholder={t("Любой эмодзи")}
              value={emoji}
              onChange={(e) => {
                setEmoji(e.target.value);
                const first = firstEmoji(e.target.value);
                if (first) onChange(`emoji:${first}`);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  noneLabel,
}: {
  value: string | undefined;
  onChange: (color: string | undefined) => void;
  noneLabel: string;
}) {
  const custom = value?.startsWith("#") ? value : "#3b82f6";
  return (
    <div className="pf-swatches" role="radiogroup">
      <button
        type="button"
        role="radio"
        aria-checked={!value}
        title={noneLabel}
        aria-label={noneLabel}
        className={"pf-swatch pf-swatch-none" + (!value ? " pf-selected" : "")}
        onClick={() => onChange(undefined)}
      />
      {COLOR_TOKENS.map((c) => (
        <button
          type="button"
          role="radio"
          key={c}
          aria-checked={value === c}
          title={c}
          aria-label={c}
          className={"pf-swatch" + (value === c ? " pf-selected" : "")}
          style={{ background: colorCss(c) }}
          onClick={() => onChange(c)}
        />
      ))}
      <label
        className={
          "pf-swatch pf-swatch-custom" +
          (value?.startsWith("#") ? " pf-selected" : "")
        }
        title={t("Свой цвет")}
        style={value?.startsWith("#") ? { background: value } : undefined}
      >
        <input
          type="color"
          aria-label={t("Свой цвет")}
          value={custom}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

const fillLabel = (fill: Fill) =>
  ({
    none: t("Без заливки"),
    badge: t("Подложка иконки"),
    stripe: t("Полоса слева"),
    row: t("Фон строки"),
  })[fill];

/** Icon, color and fill; `inherit` adds an "as inherited" choice per field. */
function StyleFields({
  value,
  onChange,
  inherit,
  effective,
}: {
  value: Style;
  onChange: (next: Style) => void;
  inherit: boolean;
  effective: { icon: string; color?: string; fill: Fill };
}) {
  const [picking, setPicking] = useState(false);
  const icon = value.icon ?? effective.icon;
  return (
    <div className="pf-style-fields">
      <div className="pf-style-row">
        <span className="pf-style-label">{t("Иконка")}</span>
        <button
          type="button"
          className="pf-icon-button"
          aria-expanded={picking}
          onClick={() => setPicking(!picking)}
        >
          <Glyph icon={icon} color={value.color ?? effective.color} />
          <span>{picking ? t("Скрыть") : t("Выбрать")}</span>
        </button>
        {inherit && value.icon !== undefined && (
          <button
            type="button"
            className="pf-link-button"
            onClick={() => onChange({ ...value, icon: undefined })}
          >
            {t("Как у уровня")}
          </button>
        )}
      </div>
      {picking && (
        <IconPicker
          value={value.icon}
          onChange={(next) => onChange({ ...value, icon: next })}
        />
      )}
      <div className="pf-style-row">
        <span className="pf-style-label">{t("Цвет")}</span>
        <ColorPicker
          value={value.color}
          noneLabel={inherit ? t("Как у уровня") : t("Без цвета")}
          onChange={(color) => onChange({ ...value, color })}
        />
      </div>
      <div className="pf-style-row">
        <span className="pf-style-label">{t("Заливка")}</span>
        <select
          className="border rounded-md bg-background p-1.5 text-sm"
          value={value.fill ?? ""}
          onChange={(e) =>
            onChange({ ...value, fill: (e.target.value || undefined) as Fill })
          }
        >
          {inherit && (
            <option value="">
              {t("Как у уровня")} ({fillLabel(effective.fill)})
            </option>
          )}
          {FILLS.map((f) => (
            <option key={f} value={f}>
              {fillLabel(f)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function PreviewRow({
  name,
  look,
  depth,
}: {
  name: string;
  look: { icon: string; color?: string; fill: Fill };
  depth: number;
}) {
  const row = rowDecoration(look);
  return (
    <div
      className={"pf-preview-row" + row.className}
      style={{ ...row.style, marginInlineStart: depth * 14 }}
    >
      <Glyph {...look} />
      {name ? <span>{name}</span> : <span className="pf-preview-bar" />}
    </div>
  );
}

const levelTitle = (level: LevelKey) =>
  ({
    project: t("Проекты"),
    level1: t("Разделы 1 уровня"),
    level2: t("Разделы 2 уровня"),
    level3: t("Разделы 3 уровня и глубже"),
  })[level];
const presetTitle = (preset: Preset) =>
  ({
    standard: t("Стандарт"),
    mono: t("Монохром"),
    levels: t("По уровням"),
    projects: t("По проектам"),
  })[preset];

const sameLook = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export function AppearanceSettings() {
  const { prefs, items, savePrefs } = usePrefs();
  const [level, setLevel] = useState<LevelKey>("project");
  const [error, setError] = useState("");
  const save = (appearance: typeof prefs.appearance) =>
    savePrefs({ ...prefs, appearance }).then(
      () => setError(""),
      (e) => setError(String(e)),
    );
  const sampleFolders = [
    { id: "s1", parentId: null, projectId: "sample" },
    { id: "s2", parentId: "s1", projectId: "sample" },
    { id: "s3", parentId: "s2", projectId: "sample" },
  ];
  const sampleFor = (appearance: typeof prefs.appearance) => {
    const p = { ...prefs, appearance };
    return [null, ...sampleFolders].map((folder) =>
      resolveStyle({
        prefs: p,
        items: {},
        folders: sampleFolders,
        projectId: "sample",
        folder,
      }),
    );
  };
  const current = sampleFor(prefs.appearance);
  const names = [
    t("Проект"),
    t("Раздел"),
    t("Подраздел"),
    t("Раздел 3 уровня"),
  ];
  const custom = Object.keys(items).filter((k) => {
    const { sort, limit, cascade, ...look } = items[k]!;
    return !isEmptyItem(look);
  }).length;
  const levelShort: Record<LevelKey, string> = {
    project: t("Проекты"),
    level1: t("1 уровень"),
    level2: t("2 уровень"),
    level3: t("3+ уровень"),
  };
  return (
    <div className="pf-appearance">
      <SettingsGroup
        title={t("Готовые стили")}
        hint={t(
          "Меняют оформление всех уровней сразу; дальше его можно донастроить.",
        )}
      >
        <div className="pf-preset-grid">
          {PRESETS.map((p) => {
            const look = presetAppearance(p);
            const active = sameLook(look, prefs.appearance);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                className={"pf-preset" + (active ? " pf-selected" : "")}
                onClick={() => void save(look)}
              >
                <span className="pf-preset-sample" aria-hidden="true">
                  {sampleFor(look)
                    .slice(0, 3)
                    .map((s, i) => (
                      <PreviewRow key={i} name="" look={s} depth={i} />
                    ))}
                </span>
                {active && (
                  <span className="pf-preset-check" aria-hidden="true">
                    <Icon name="Check" />
                  </span>
                )}
                <span className="pf-preset-name">{presetTitle(p)}</span>
              </button>
            );
          })}
        </div>
      </SettingsGroup>
      <SettingsGroup title={t("Цвет определяется")}>
        <div className="pf-choice-grid" role="radiogroup">
          {(
            [
              ["level", t("По уровню"), t("У каждого уровня свой цвет")],
              [
                "project",
                t("По проекту"),
                t("Разделы берут цвет своего проекта"),
              ],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={prefs.appearance.colorBy === value}
              className={
                "pf-choice" +
                (prefs.appearance.colorBy === value ? " pf-selected" : "")
              }
              onClick={() => void save({ ...prefs.appearance, colorBy: value })}
            >
              <span className="pf-choice-dot" />
              <span className="pf-choice-text">
                <strong>{label}</strong>
                <span>{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </SettingsGroup>
      <SettingsGroup
        title={t("Уровни")}
        hint={t("Выберите уровень и настройте его иконку, цвет и заливку.")}
      >
        <div className="pf-tabs pf-level-tabs" role="tablist">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={level === l}
              className={"pf-tab" + (level === l ? " pf-selected" : "")}
              onClick={() => setLevel(l)}
            >
              <Glyph {...current[LEVELS.indexOf(l)]!} />
              {levelShort[l]}
            </button>
          ))}
        </div>
        <div className="pf-appearance-grid">
          <div role="tabpanel" aria-label={levelTitle(level)}>
            <StyleFields
              key={level}
              inherit={false}
              value={prefs.appearance.levels[level]}
              effective={{
                icon: prefs.appearance.levels[level].icon ?? "icon:Folder",
                color: prefs.appearance.levels[level].color,
                fill: prefs.appearance.levels[level].fill ?? "none",
              }}
              onChange={(next) =>
                void save({
                  ...prefs.appearance,
                  levels: { ...prefs.appearance.levels, [level]: next },
                })
              }
            />
            {prefs.appearance.colorBy === "project" && level !== "project" && (
              <p className="pf-sgroup-hint mt-2">
                {t("Цвет берётся у проекта; здесь он не применяется.")}
              </p>
            )}
          </div>
          <aside className="pf-preview" aria-label={t("Предпросмотр")}>
            <div className="pf-preview-title">{t("Предпросмотр")}</div>
            {current.map((s, i) => (
              <div
                key={i}
                className={
                  "pf-preview-slot" +
                  (LEVELS.indexOf(level) === i ? " pf-selected" : "")
                }
              >
                <PreviewRow name={names[i]!} look={s} depth={i} />
              </div>
            ))}
          </aside>
        </div>
      </SettingsGroup>
      <SettingsGroup
        title={t("Отдельное оформление")}
        hint={t(
          "Любой проект или раздел можно оформить отдельно: пункт «Оформление» в его меню ⋯.",
        )}
        actions={
          custom > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (
                  !confirm(
                    t(
                      "Сбросить оформление всех проектов и разделов к настройкам уровней?",
                    ),
                  )
                )
                  return;
                const next: typeof items = {};
                for (const [k, v] of Object.entries(items)) {
                  const kept = { sort: v.sort, limit: v.limit };
                  if (!isEmptyItem(kept)) next[k] = kept;
                }
                savePrefs(prefs, next).catch((e) => setError(String(e)));
              }}
            >
              {t("Сбросить все")}
            </Button>
          ) : undefined
        }
      >
        <p className="text-sm">
          {t("Оформлено отдельно")}: {custom}
        </p>
      </SettingsGroup>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function TransferSettings() {
  const { prefs, items, savePrefs } = usePrefs();
  const rpc = useRpc<typeof rpcContract>();
  const [withItems, setWithItems] = useState(true);
  const [merge, setMerge] = useState(false);
  const [message, setMessage] = useState("");
  const [fullMessage, setFullMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const fullFileRef = useRef<HTMLInputElement>(null);
  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify(exportPayload(prefs, items), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project-folders-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportEverything = async () => {
    try {
      const payload = await rpc.call("backup_export", null);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "project-folders-backup.json";
      a.click();
      URL.revokeObjectURL(url);
      setFullMessage("");
    } catch (err) {
      setFullMessage(String(err));
    }
  };
  return (
    <>
      <SettingsGroup
        title={t("Экспорт")}
        hint={t(
          "Файл содержит настройки списка, оформление уровней и оформление отдельных проектов и разделов. Правила AGENTS.md в него не входят.",
        )}
        actions={
          <Button size="sm" variant="outline" onClick={exportJson}>
            <Icon name="Download" />
            {t("Экспортировать")}
          </Button>
        }
      >
        {null}
      </SettingsGroup>
      <SettingsGroup
        title={t("Импорт")}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            <Icon name="FolderExport" />
            {t("Импортировать…")}
          </Button>
        }
      >
        <SettingRow
          label={t(
            "При импорте заменить и оформление отдельных проектов и разделов",
          )}
          htmlFor="pf-set-import-items"
        >
          <Switch
            id="pf-set-import-items"
            label={t(
              "При импорте заменить и оформление отдельных проектов и разделов",
            )}
            checked={withItems}
            onChange={setWithItems}
          />
        </SettingRow>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const data = parseImport(await file.text());
              await savePrefs(data.prefs, withItems ? data.items : undefined);
              setMessage(t("Настройки импортированы."));
            } catch (err) {
              setMessage(String(err));
            }
          }}
        />
        {message && (
          <p className="text-sm" role="status">
            {message}
          </p>
        )}
      </SettingsGroup>
      <SettingsGroup
        title={t("Экспорт всего")}
        hint={t(
          "Полный файл содержит разделы, правила, архивы, оформление и настройки. Очереди экспорта чатов и незавершённые переносы в него не входят.",
        )}
        actions={
          <Button size="sm" variant="outline" onClick={() => void exportEverything()}>
            <Icon name="Download" />
            {t("Экспортировать всё")}
          </Button>
        }
      >
        {null}
      </SettingsGroup>
      <SettingsGroup
        title={t("Импорт всего")}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => fullFileRef.current?.click()}
          >
            <Icon name="FolderExport" />
            {t("Импортировать всё…")}
          </Button>
        }
      >
        <SettingRow
          label={t("При импорте объединить с уже существующими записями")}
          htmlFor="pf-set-import-merge"
        >
          <Switch
            id="pf-set-import-merge"
            label={t("При импорте объединить с уже существующими записями")}
            checked={merge}
            onChange={setMerge}
          />
        </SettingRow>
        <input
          ref={fullFileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (
              !merge &&
              !confirm(
                t(
                  "Заменить все данные плагина содержимым файла? Текущие разделы, правила и архивы будут удалены.",
                ),
              )
            )
              return;
            try {
              const backup = JSON.parse(await file.text());
              await rpc.call("backup_import", {
                backup,
                mode: merge ? "merge" : "replace",
              });
              setFullMessage(t("Все данные импортированы."));
            } catch (err) {
              setFullMessage(String(err));
            }
          }}
        />
        {fullMessage && (
          <p className="text-sm" role="status">
            {fullMessage}
          </p>
        )}
      </SettingsGroup>
    </>
  );
}

const sortLabel = (sort: ChatSort) =>
  ({
    activity: t("По активности"),
    title: t("По алфавиту"),
    created: t("Сначала новые"),
  })[sort];

/** Per project or section look, opened from its ⋯ menu. */
export function AppearanceDialog({
  target,
  folders,
  onClose,
}: {
  target: { projectId: string; folder: TreeFolder | null; name: string } | null;
  folders: readonly TreeFolder[];
  onClose: () => void;
}) {
  const { prefs, items, saveItem } = usePrefs();
  const key = target
    ? target.folder
      ? folderKey(target.folder.id)
      : projectKey(target.projectId)
    : "";
  const [draft, setDraft] = useState<ItemStyle>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!target) return;
    setDraft(items[key] ?? {});
    setError("");
    // Reset the draft only when another item opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, !!target]);
  if (!target) return null;
  const inherited = resolveStyle({
    prefs,
    items: { ...items, [key]: {} },
    folders,
    projectId: target.projectId,
    folder: target.folder,
  });
  const effective = resolveStyle({
    prefs,
    items: { ...items, [key]: { ...draft, cascade: draft.cascade } },
    folders,
    projectId: target.projectId,
    folder: target.folder,
  });
  const save = async (style: ItemStyle | null) => {
    setBusy(true);
    try {
      await saveItem(key, style);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="pf-dialog pf pf-appearance-dialog">
        <DialogHeader>
          <DialogTitle>{t("Оформление")}</DialogTitle>
          <DialogDescription>{target.name}</DialogDescription>
        </DialogHeader>
        <PreviewRow name={target.name} look={effective} depth={0} />
        <StyleFields
          inherit
          value={draft}
          effective={inherited}
          onChange={(next) => setDraft({ ...draft, ...next })}
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer mt-3">
          <input
            type="checkbox"
            checked={!!draft.cascade}
            onChange={(e) =>
              setDraft({ ...draft, cascade: e.target.checked || undefined })
            }
          />
          <span>
            {t(
              "Применять ко всем вложенным разделам, если у них нет своего оформления",
            )}
          </span>
        </label>
        <div className="pf-chat-settings">
          <label className="block text-sm">
            {t("Сортировка чатов")}
            <select
              className="block w-full border rounded-md bg-background p-2 mt-1"
              value={draft.sort ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  sort: (e.target.value || undefined) as ChatSort | undefined,
                })
              }
            >
              <option value="">
                {t("Как в общих настройках")} ({sortLabel(inherited.sort)})
              </option>
              <option value="activity">{t("По активности")}</option>
              <option value="title">{t("По алфавиту")}</option>
              <option value="created">{t("Сначала новые")}</option>
            </select>
          </label>
          <label className="block text-sm">
            {t("Чатов в каждом разделе")}
            <input
              className="block w-full border rounded-md bg-background p-2 mt-1"
              type="number"
              min={1}
              max={100}
              placeholder={String(inherited.limit)}
              value={draft.limit ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                setDraft({
                  ...draft,
                  limit:
                    e.target.value && Number.isInteger(n) && n >= 1 && n <= 100
                      ? n
                      : undefined,
                });
              }}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy || !items[key]}
            onClick={() => void save(null)}
          >
            {t("Сбросить")}
          </Button>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("Отмена")}
          </Button>
          <Button disabled={busy} onClick={() => void save(draft)}>
            {t("Сохранить")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
