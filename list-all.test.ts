import { describe, it, expect } from "vitest";
import { listAll, LIST_PAGE } from "./list-all";

describe("listAll", () => {
  it("reads every page until one comes back short", async () => {
    const rows = Array.from({ length: LIST_PAGE * 2 + 3 }, (_, i) => i);
    const asked: { limit: number; offset: number }[] = [];
    const all = await listAll(async (range) => {
      asked.push(range);
      return rows.slice(range.offset, range.offset + range.limit);
    });
    expect(all).toEqual(rows);
    expect(asked.map((a) => a.offset)).toEqual([0, LIST_PAGE, LIST_PAGE * 2]);
    expect(asked.every((a) => a.limit === LIST_PAGE)).toBe(true);
  });
});
