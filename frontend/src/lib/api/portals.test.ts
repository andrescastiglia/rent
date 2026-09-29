import { portalsApi, safePortalLink } from "./portals";
import { apiClient } from "../api";
import { getToken } from "../auth";
jest.mock("../api", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock("../auth", () => ({ getToken: jest.fn() }));
beforeEach(() => jest.resetAllMocks());
it.each(["token", null])(
  "uses authenticated scoped internal endpoints (%s)",
  async (token) => {
    jest.mocked(getToken).mockReturnValue(token);
    await portalsApi.list("property/id");
    await portalsApi.get("listing/id");
    await portalsApi.operation("listing/id");
    await portalsApi.history("listing/id");
    await portalsApi.candidate("listing/id", "job/id", "MLA123");
    await portalsApi.resolve("listing/id", "job/id", {
      action: "retry",
      reason: "Reviewed account",
    });
    await portalsApi.refresh("listing/id");
    const auth = token || undefined;
    expect(apiClient.get).toHaveBeenCalledWith(
      "/portals/listings?propertyId=property%2Fid",
      auth,
    );
    expect(apiClient.get).toHaveBeenCalledWith(
      "/portals/listings/listing%2Fid",
      auth,
    );
    expect(apiClient.get).toHaveBeenCalledWith(
      "/portals/listings/listing%2Fid/operation",
      auth,
    );
    expect(apiClient.get).toHaveBeenCalledWith(
      "/portals/listings/listing%2Fid/resolutions",
      auth,
    );
    expect(apiClient.get).toHaveBeenCalledWith(
      "/portals/listings/listing%2Fid/operations/job%2Fid/candidate/MLA123",
      auth,
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      "/portals/listings/listing%2Fid/operations/job%2Fid/resolve",
      { action: "retry", reason: "Reviewed account" },
      auth,
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      "/portals/listings/listing%2Fid/refresh",
      {},
      auth,
    );
  },
);
it.each([
  null,
  "not-url",
  "javascript:alert(1)",
  "https://evil.test/",
  "https://mercadolibre.com.ar.evil.test/",
  "ftp://mercadolibre.com.ar/item",
  "https://user@mercadolibre.com.ar/item",
  "https://mercadolibre.com.ar:8443/item",
])("rejects unsafe remote URLs", (url) =>
  expect(safePortalLink(url)).toBeUndefined(),
);
it("upgrades official HTTP links to HTTPS", () =>
  expect(safePortalLink("http://departamento.mercadolibre.com.ar/item")).toBe(
    "https://departamento.mercadolibre.com.ar/item",
  ));

it.each(["token", null])("uses scoped editor routes (%s)", async (token) => {
  jest.mocked(getToken).mockReturnValue(token);
  const auth = token || undefined;
  await portalsApi.category("MLA/id");
  await portalsApi.states();
  await portalsApi.cities("state/id");
  await portalsApi.neighborhoods("city/id");
  await portalsApi.create("property", { item: {} });
  await portalsApi.update("listing/id", { description: "Text" });
  await portalsApi.publish("listing/id");
  await portalsApi.pause("listing/id");
  await portalsApi.close("listing/id");
  for (const path of [
    "categories/MLA%2Fid",
    "states",
    "states/state%2Fid/cities",
    "cities/city%2Fid/neighborhoods",
  ])
    expect(apiClient.get).toHaveBeenCalledWith(
      `/portals/mercadolibre/catalog/${path}`,
      auth,
    );
  expect(apiClient.post).toHaveBeenCalledWith(
    "/portals/listings",
    {
      propertyId: "property",
      portal: "mercadolibre",
      listingData: { item: {} },
    },
    auth,
  );
  expect(apiClient.patch).toHaveBeenCalledWith(
    "/portals/listings/listing%2Fid",
    { listingData: { description: "Text" } },
    auth,
  );
  for (const action of ["publish", "pause"])
    expect(apiClient.post).toHaveBeenCalledWith(
      `/portals/listings/listing%2Fid/${action}`,
      {},
      auth,
    );
  expect(apiClient.delete).toHaveBeenCalledWith(
    "/portals/listings/listing%2Fid",
    auth,
  );
});
