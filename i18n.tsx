import { useSyncExternalStore } from "react";
import { english } from "./translations";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import pt from "./locales/pt.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import hi from "./locales/hi.json";
import ar from "./locales/ar.json";
type Dictionary = Record<keyof typeof english, string>;
export const catalogs = {
  en: english,
  es,
  fr,
  de,
  pt,
  zh,
  ja,
  ko,
  hi,
  ar,
} satisfies Record<string, Dictionary>;
export const languages = {
  en: "English",
  ru: "Русский",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  zh: "简体中文",
  ja: "日本語",
  ko: "한국어",
  hi: "हिन्दी",
  ar: "العربية",
};
export type Language = keyof typeof languages;
const key = "project-folders:language";
function preference(): string {
  try {
    const saved = localStorage.getItem(key) || "";
    if (saved) return saved;
  } catch {
    // Storage failure means no saved choice: fall through to the environment.
  }
  if (
    typeof document !== "undefined" &&
    document.documentElement.lang.toLowerCase().startsWith("ru")
  )
    return "ru";
  const primary =
    (typeof navigator !== "undefined" ? navigator.language : "")
      .split("-")[0]
      ?.toLowerCase() ?? "";
  return Object.hasOwn(languages, primary) ? primary : "en";
}
export function resolveLanguage(value: string): Language {
  return Object.hasOwn(languages, value) ? (value as Language) : "en";
}
function language() {
  return resolveLanguage(preference());
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("project-folders:language", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("project-folders:language", listener);
  };
}
export function useLanguage() {
  return useSyncExternalStore(subscribe, language, () => "en" as Language);
}
export function direction() {
  return language() === "ar" ? ("rtl" as const) : ("ltr" as const);
}
export function t(text: keyof typeof english): string {
  const lang = language();
  return lang === "ru" ? text : catalogs[lang][text] || english[text];
}
export function LanguagePicker() {
  const lang = useLanguage();
  return (
    <select
      aria-label="Language"
      title="Language"
      className="bg-background border rounded-md px-2 py-1 text-sm max-w-40"
      value={lang}
      onChange={(e) => {
        localStorage.setItem(key, e.target.value);
        window.dispatchEvent(new Event("project-folders:language"));
      }}
    >
      {Object.entries(languages).map(([id, label]) => (
        <option value={id} key={id}>
          {label}
        </option>
      ))}
    </select>
  );
}
