import { apiClient } from '@/api/client';
import {
  fetchAllPages,
  fetchPage,
  listPath,
  mockPage,
  normalizePage,
} from './pagination';
jest.mock('@/api/client', () => ({ apiClient: { get: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());
it('preserves existing filters and encodes server search', () => {
  expect(
    listPath('/properties?operation=rent', {
      search: 'San Martín & 42',
      page: 2,
      limit: 20,
      status: undefined,
    }),
  ).toBe(
    '/properties?operation=rent&search=San+Mart%C3%ADn+%26+42&page=2&limit=20',
  );
  expect(listPath('/owners', {})).toBe('/owners');
});
it('retains page metadata and maps rows', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({
    items: [{ id: 1 }],
    page: 2,
    total: 42,
    limit: 20,
  });
  await expect(
    fetchPage<{ id: number }, number>(
      '/properties',
      { page: 2 },
      (row) => row.id,
    ),
  ).resolves.toEqual({ data: [1], page: 2, total: 42, limit: 20 });
});
it('supports non-paginated endpoints without requesting nonexistent pages', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue([{ id: 1 }, { id: 2 }]);
  await expect(fetchAllPages('/owners')).resolves.toEqual([
    { id: 1 },
    { id: 2 },
  ]);
  expect(apiClient.get).toHaveBeenCalledTimes(1);
});
it('finds records on later pages for legacy selectors', async () => {
  (apiClient.get as jest.Mock)
    .mockResolvedValueOnce({
      data: [{ id: 'first' }],
      page: 1,
      total: 2,
      limit: 1,
    })
    .mockResolvedValueOnce({
      data: [{ id: 'later' }],
      page: 2,
      total: 2,
      limit: 1,
    });
  expect(await fetchAllPages('/tenants', { name: 'Ana', limit: 1 })).toEqual([
    { id: 'first' },
    { id: 'later' },
  ]);
  expect(apiClient.get).toHaveBeenNthCalledWith(
    2,
    '/tenants?name=Ana&limit=1&page=2',
  );
});
it('rejects early empty pages instead of silently returning an incomplete collection', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({
    data: [],
    page: 1,
    total: 42,
    limit: 20,
  });
  await expect(fetchAllPages('/properties')).rejects.toThrow('empty page');
});
it.each([
  { data: [], total: -1, page: 1, limit: 20 },
  { data: [], total: 10, page: 0, limit: 20 },
  { data: [], total: 10, page: 1, limit: 0 },
  { data: [], total: 10.5, page: 1, limit: 20 },
])('rejects invalid metadata %j', (response) => {
  expect(() => normalizePage(response)).toThrow('Invalid paginated');
});
it('rejects a server that ignores requested page', () => {
  expect(() =>
    normalizePage({ data: [], total: 10, page: 1, limit: 20 }, 2),
  ).toThrow('different page');
});
it('mocks the same pagination contract used in production', () => {
  expect(mockPage([1, 2, 3], { page: 2, limit: 2 })).toEqual({
    data: [3],
    total: 3,
    page: 2,
    limit: 2,
  });
  expect(normalizePage([])).toEqual({ data: [], total: 0, page: 1, limit: 20 });
});
