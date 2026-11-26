/** The largest page BB serves for `threads.list` and `environments.list`. */
export const LIST_PAGE = 500;

/**
 * Every row of a BB list call, page by page. BB caps an unpaged list at 200
 * rows and rejects a limit above 500, so a plain `list()` would silently drop
 * the rest once a user has more.
 */
export async function listAll<T>(
  page: (range: { limit: number; offset: number }) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const got = await page({ limit: LIST_PAGE, offset });
    rows.push(...got);
    if (got.length < LIST_PAGE) return rows;
  }
}
