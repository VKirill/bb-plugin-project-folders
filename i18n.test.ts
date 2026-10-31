// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { resolveLanguage, catalogs, languages, t } from "./i18n";
import { english } from "./translations";
const key = "project-folders:language";
const navigatorOriginal = Object.getOwnPropertyDescriptor(
  Navigator.prototype,
  "language",
);
function stubNavigatorLanguage(value: string) {
  Object.defineProperty(window.navigator, "language", {
    value,
    configurable: true,
  });
}
afterEach(() => {
  localStorage.clear();
  document.documentElement.lang = "";
  delete (window.navigator as { language?: string }).language;
  if (navigatorOriginal)
    Object.defineProperty(Navigator.prototype, "language", navigatorOriginal);
});
describe("language selection", () => {
  it("defaults unsupported and legacy automatic settings to English", () => {
    for (const value of ["", "auto", "unsupported"])
      expect(resolveLanguage(value)).toBe("en");
    for (const value of Object.keys(languages))
      expect(resolveLanguage(value)).toBe(value);
  });
  it("has a nonempty value for every label in every catalog", () => {
    for (const dictionary of Object.values(catalogs)) {
      expect(Object.keys(dictionary).sort()).toEqual(
        Object.keys(english).sort(),
      );
      for (const value of Object.values(dictionary))
        expect(value.trim().length).toBeGreaterThan(0);
    }
  });
  it("falls back to the navigator language when nothing is stored and html lang is empty", () => {
    stubNavigatorLanguage("ru-RU");
    expect(t("Работает")).toBe("Работает");
    stubNavigatorLanguage("de-DE");
    expect(t("Работает")).toBe(catalogs.de["Работает"]);
    stubNavigatorLanguage("nl-NL");
    expect(t("Работает")).toBe("Working");
  });
  it("lets the html lang win over the navigator language", () => {
    stubNavigatorLanguage("de-DE");
    document.documentElement.lang = "ru";
    expect(t("Работает")).toBe("Работает");
  });
  it("a stored choice wins over html lang and navigator language", () => {
    stubNavigatorLanguage("ru-RU");
    document.documentElement.lang = "ru";
    localStorage.setItem(key, "en");
    expect(t("Работает")).toBe("Working");
    localStorage.setItem(key, "de");
    expect(t("Работает")).toBe(catalogs.de["Работает"]);
  });
  it("a storage failure means no saved choice: environment hints still apply", () => {
    stubNavigatorLanguage("ru-RU");
    document.documentElement.lang = "ru";
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("storage blocked");
    };
    try {
      expect(t("Работает")).toBe("Работает");
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
