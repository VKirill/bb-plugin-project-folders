import { errorCatalog, type ErrorId } from "./errors/catalog";

/** Separates the readable English text from the data the UI translates. */
const MARK = "\n⁣pf-error:";
export type ErrorParams = Record<string, string | number>;

export const fillText = (text: string, params: ErrorParams = {}) =>
  text.replace(/\{(\w+)\}/g, (all, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : all,
  );

/**
 * An error a person reads. The message starts with the English text, so the
 * CLI and logs stay readable; the UI finds the id and params after it and
 * shows the text in the chosen language.
 */
export function userError(id: ErrorId, params: ErrorParams = {}): Error {
  return new Error(
    fillText(errorCatalog[id].en, params) + MARK + JSON.stringify({ id, params }),
  );
}

export function parseUserError(
  message: string,
): { id: ErrorId; params: ErrorParams } | null {
  const at = message.indexOf(MARK);
  if (at < 0) return null;
  try {
    const data = JSON.parse(message.slice(at + MARK.length)) as {
      id?: unknown;
      params?: unknown;
    };
    if (typeof data.id !== "string" || !Object.hasOwn(errorCatalog, data.id))
      return null;
    return {
      id: data.id as ErrorId,
      params:
        data.params && typeof data.params === "object"
          ? (data.params as ErrorParams)
          : {},
    };
  } catch {
    return null;
  }
}
