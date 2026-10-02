import { apiClient } from '@/api/client';

export type Page<T> = { data: T[]; total: number; page: number; limit: number };
export type PageResponse<T> =
  T[] | Page<T> | { items: T[]; total: number; page: number; limit: number };
export type ListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  [key: string]: string | number | boolean | undefined;
};

export function listPath(path: string, query: ListQuery = {}): string {
  const [base, current] = path.split('?');
  const params = new URLSearchParams(current);
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(name, String(value));
  }
  return params.size ? `${base}?${params}` : base;
}

export function normalizePage<T>(
  response: PageResponse<T>,
  page = 1,
  limit = 20,
): Page<T> {
  if (Array.isArray(response))
    return {
      data: response,
      total: response.length,
      page: 1,
      limit: response.length || limit,
    };
  const data = 'data' in response ? response.data : response.items;
  if (
    !Array.isArray(data) ||
    !Number.isInteger(response.total) ||
    response.total < 0 ||
    !Number.isInteger(response.page) ||
    response.page < 1 ||
    !Number.isInteger(response.limit) ||
    response.limit < 1
  )
    throw new Error('Invalid paginated API response');
  if (response.page !== page)
    throw new Error('The API returned a different page');
  return {
    data,
    total: response.total,
    page: response.page,
    limit: response.limit,
  };
}

export async function fetchPage<T, R = T>(
  path: string,
  query: ListQuery = {},
  map: (row: T) => R = (row) => row as unknown as R,
): Promise<Page<R>> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const response = await apiClient.get<PageResponse<T>>(
    listPath(path, { ...query, page, limit }),
  );
  const result = normalizePage(response, page, limit);
  return { ...result, data: result.data.map(map) };
}

/** For legacy selectors that still need the complete collection. Never silently truncate. */
export async function fetchAllPages<T, R = T>(
  path: string,
  query: ListQuery = {},
  map: (row: T) => R = (row) => row as unknown as R,
): Promise<R[]> {
  const items: R[] = [];
  let page = query.page ?? 1;
  for (;;) {
    const result = await fetchPage<T, R>(
      path,
      { ...query, page, limit: query.limit ?? 50 },
      map,
    );
    items.push(...result.data);
    if (page * result.limit >= result.total) return items;
    if (!result.data.length)
      throw new Error(
        'The API returned an empty page before the end of the collection',
      );
    page += 1;
  }
}

export function mockPage<T>(items: T[], query: ListQuery = {}): Page<T> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  return {
    data: items.slice((page - 1) * limit, page * limit),
    total: items.length,
    page,
    limit,
  };
}
