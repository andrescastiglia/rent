import { contractDocumentsApi as api } from "./contract-documents";
import { apiClient } from "../api";
import { getToken } from "../auth";
jest.mock("../api", () => ({ apiClient: { get: jest.fn() } }));
jest.mock("../auth", () => ({ getToken: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getToken).mockReturnValue("token");
});
it("uses escaped authenticated status reads without mock documents", async () => {
  await api.status("id/?");
  expect(apiClient.get).toHaveBeenCalledWith(
    "/contracts/id%2F%3F/contract-status",
    "token",
  );
});
it("downloads bytes only after a successful authenticated response and releases the object URL", async () => {
  const previousFetch = global.fetch,
    previousCreate = URL.createObjectURL,
    previousRevoke = URL.revokeObjectURL;
  const fetchMock = jest
    .fn()
    .mockResolvedValue({ ok: true, blob: async () => new Blob(["pdf"]) });
  global.fetch = fetchMock;
  URL.createObjectURL = jest.fn().mockReturnValue("blob:contract");
  URL.revokeObjectURL = jest.fn();
  const click = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  try {
    await api.download("id/?");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/contracts/id%2F%3F/contract",
      { headers: { Authorization: "Bearer token" } },
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:contract");
    expect(document.querySelector("a[download]")).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(api.download("id")).rejects.toThrow("download failed");
    expect(click).toHaveBeenCalledTimes(1);
    jest.mocked(getToken).mockReturnValue(null);
    await expect(api.download("id")).rejects.toThrow("Authentication required");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    global.fetch = previousFetch;
    URL.createObjectURL = previousCreate;
    URL.revokeObjectURL = previousRevoke;
    click.mockRestore();
  }
});
