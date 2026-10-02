import { collectPages } from "./pagination";

it("preserves records beyond the first page", async () => {
  const load = jest.fn(async (page: number) => ({
    data: page === 1 ? [1, 2] : [3],
    total: 3,
    page,
    limit: 2,
  }));
  expect(await collectPages(load)).toEqual([1, 2, 3]);
  expect(load.mock.calls).toEqual([[1], [2]]);
});
it("avoids extra requests for a complete or empty page", async () => {
  const load = jest.fn(async () => ({
    data: [] as number[],
    total: 0,
    page: 1,
    limit: 20,
  }));
  expect(await collectPages(load)).toEqual([]);
  expect(load).toHaveBeenCalledTimes(1);
});
it.each([
  { data: [1], page: 1, limit: 0 },
  { data: [], page: 1, limit: 2 },
  { data: [1], page: 2, limit: 2 },
])(
  "rejects invalid metadata without an infinite request loop",
  async (page) => {
    await expect(
      collectPages(async () => ({ ...page, total: 3 })),
    ).rejects.toThrow("Invalid pagination metadata");
  },
);
it("reports an incomplete later page", async () => {
  await expect(
    collectPages(async (page) => ({
      data: page === 1 ? [1] : [],
      total: 2,
      page,
      limit: 1,
    })),
  ).rejects.toThrow("incomplete list");
});
it("propagates a later server failure", async () => {
  await expect(
    collectPages(async (page) => {
      if (page === 2) throw new Error("Offline");
      return { data: [1], total: 2, page, limit: 1 };
    }),
  ).rejects.toThrow("Offline");
});

it.each([
  { total: -1, limit: 1, page: 1, data: [] },
  { total: Number.NaN, limit: 1, page: 1, data: [] },
  { total: 0, limit: 0, page: 1, data: [] },
  { total: 2, limit: 1.5, page: 1, data: [1] },
  { total: 1, limit: 2, page: 1, data: [1, 2] },
])(
  "rejects invalid totals and limits even when the collection looks complete",
  async (metadata) => {
    await expect(collectPages(async () => metadata)).rejects.toThrow(
      "Invalid pagination metadata",
    );
  },
);

it.each([
  { total: 3, limit: 2, page: 2, data: [2] },
  { total: 2, limit: 1, page: 1, data: [2] },
  { total: 2, limit: 2, page: 2, data: [2] },
  { total: 2, limit: 1, page: 2, data: [2, 3] },
])(
  "does not silently accept pagination metadata that changes during a read",
  async (metadata) => {
    await expect(
      collectPages(async (page) =>
        page === 1 ? { total: 2, limit: 1, page, data: [1] } : metadata,
      ),
    ).rejects.toThrow("incomplete list");
  },
);

it("reports a final page whose row count cannot account for the server total", async () => {
  await expect(
    collectPages(async (page) => ({ total: 4, limit: 2, page, data: [page] })),
  ).rejects.toThrow("incomplete list");
});
