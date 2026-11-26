import { describe, expect, it } from "vitest";
import { errorCatalog } from "./catalog";
import { catalogs } from "../i18n";

const LANGS = ["ru", ...Object.keys(catalogs)] as const;
const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("error catalog", () => {
  it("has every message in every UI language with the same placeholders", () => {
    const problems: string[] = [];
    for (const [id, entry] of Object.entries(errorCatalog)) {
      const want = holes(entry.en);
      for (const lang of LANGS) {
        const text = (entry as Record<string, string>)[lang];
        if (!text?.trim()) problems.push(`${id}.${lang}: empty`);
        else if (holes(text).join() !== want.join())
          problems.push(`${id}.${lang}: {${holes(text)}} ≠ {${want}}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
