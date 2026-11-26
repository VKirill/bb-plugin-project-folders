import { errorCatalog, type ErrorId } from "./errors/catalog";
import { language } from "./i18n";
import { fillText, parseUserError, type ErrorParams } from "./user-error";

const text = (id: ErrorId, params: ErrorParams = {}) => {
  const lang = language();
  const entry = errorCatalog[id];
  return fillText(entry[lang] || entry.en, params);
};

/** `EACCES: permission denied, mkdir '/a/b'` → `/a/b`. */
const quotedPath = (message: string) =>
  /'([^']+)'/.exec(message)?.[1] ?? /"(\/[^"]+)"/.exec(message)?.[1] ?? "";

const ERRNO: [RegExp, ErrorId][] = [
  [/\b(EACCES|EPERM)\b/, "fs_no_access"],
  [/\bENOENT\b/, "fs_not_found"],
  [/\bEEXIST\b/, "fs_exists"],
  [/\bENOTEMPTY\b/, "fs_not_empty"],
  [/\bENOSPC\b/, "fs_no_space"],
  [/\bEBUSY\b/, "fs_busy"],
  [/\bEROFS\b/, "fs_read_only"],
  [/\bENAMETOOLONG\b/, "fs_name_too_long"],
  [/\bEXDEV\b/, "fs_cross_device"],
];

/** Field names of a schema validation failure, when the message carries them. */
function invalidFields(message: string): string | null {
  const start = message.indexOf("[");
  if (start < 0 || !/"(code|path)"\s*:/.test(message)) return null;
  try {
    const issues = JSON.parse(message.slice(start)) as { path?: unknown[] }[];
    const names = [
      ...new Set(
        issues.map((i) => (i.path ?? []).join(".")).filter(Boolean),
      ),
    ];
    return names.join(", ") || null;
  } catch {
    return null;
  }
}

/**
 * What a person reads when an action fails: the plugin's own message in the
 * chosen language, a plain explanation of a disk, network or BB failure, or
 * the original text without the technical class prefix.
 */
export function errorText(error: unknown): string {
  const raw =
    error instanceof Error ? error.message || String(error) : String(error);
  const own = parseUserError(raw);
  if (own) return text(own.id, own.params);
  const message = raw.replace(/^(?:[\w$.]*(?:Error|Exception):\s*)+/, "").trim();
  if (
    /fetch failed|Failed to fetch|NetworkError|Load failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up/i.test(
      message,
    )
  )
    return text("bb_unreachable");
  for (const [pattern, id] of ERRNO)
    if (pattern.test(message))
      return text(id, { path: quotedPath(message) || "—" });
  const fields = invalidFields(message);
  if (fields) return text("invalid_input", { fields });
  const status = /\bHTTP (\d{3})\b/.exec(message)?.[1];
  if (status === "401" || status === "403") return text("bb_forbidden");
  if (status === "404") return text("bb_not_found");
  if (status?.startsWith("5"))
    return text("bb_server_error", {
      detail: message.replace(/^.*?\bHTTP \d{3}:?\s*/, "") || `HTTP ${status}`,
    });
  return message || text("unknown", { detail: raw });
}
