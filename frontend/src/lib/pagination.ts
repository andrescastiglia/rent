export type PageResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};

/** Compatibility for array consumers; never silently truncate a server page. */
export async function collectPages<T>(
  load: (page: number) => Promise<PageResult<T>>,
): Promise<T[]> {
  const first = await load(1);
  const items = [...first.data];
  if (
    !Number.isSafeInteger(first.total) ||
    first.total < 0 ||
    !Number.isSafeInteger(first.limit) ||
    first.limit < 1 ||
    first.page !== 1 ||
    first.data.length > first.limit ||
    first.data.length > first.total
  )
    throw new Error("Invalid pagination metadata");
  if (first.total === items.length) return items;
  if (first.data.length === 0) throw new Error("Invalid pagination metadata");
  const pages = Math.ceil(first.total / first.limit);
  for (let page = 2; page <= pages; page += 1) {
    const result = await load(page);
    if (
      result.page !== page ||
      result.total !== first.total ||
      result.limit !== first.limit ||
      result.data.length === 0 ||
      result.data.length > first.limit
    )
      throw new Error("The server returned an incomplete list");
    items.push(...result.data);
  }
  if (items.length !== first.total)
    throw new Error("The server returned an incomplete list");
  return items;
}
