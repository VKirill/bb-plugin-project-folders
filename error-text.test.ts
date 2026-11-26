import { afterEach, describe, expect, it } from "vitest";
import { errorText } from "./error-text";
import { userError } from "./user-error";

const setLanguage = (lang: string) =>
  ((globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => lang,
  });
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("errorText", () => {
  it("shows the plugin's own error in the chosen language with its details", () => {
    const error = userError("device_offline", { device: "MAC Mini" });
    expect(error.message.split("\n")[0]).toBe(
      "The device “MAC Mini” is offline. Turn it on or start BB on it, then try again.",
    );
    const wrapped = new Error(`experimental_PluginRpcCallError: ${error.message}`);
    setLanguage("ru");
    expect(errorText(wrapped)).toBe(
      "Устройство «MAC Mini» сейчас не в сети. Включите его или запустите на нём BB и повторите.",
    );
    setLanguage("de");
    expect(errorText(wrapped)).toContain("„MAC Mini“");
  });

  it("explains disk, network and BB failures in plain words", () => {
    setLanguage("ru");
    expect(
      errorText(new Error("EACCES: permission denied, mkdir '/Volumes/SSD/x'")),
    ).toBe(
      "Нет прав на папку /Volumes/SSD/x. Откройте к ней доступ на устройстве или выберите другую папку.",
    );
    expect(errorText(new TypeError("fetch failed"))).toContain("Нет связи с сервером BB");
    expect(errorText("BbHttpError: HTTP 500: boom")).toContain("(boom)");
    expect(
      errorText(
        new Error('[{"code":"too_small","path":["name"],"message":"Required"}]'),
      ),
    ).toBe("Проверьте поля: name.");
  });

  it("drops the technical class prefix from anything else", () => {
    expect(
      errorText(new Error("experimental_PluginRpcCallError: Some plain text.")),
    ).toBe("Some plain text.");
  });
});
