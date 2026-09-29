import { salesApi } from "./sales";
import { getToken } from "../auth";

jest.mock("../auth", () => ({ getToken: jest.fn() }));

describe("sale receipt downloads", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    global.fetch = fetchMock;
    fetchMock.mockReset();
    (getToken as jest.Mock).mockReturnValue("user-token");
    URL.createObjectURL = jest.fn().mockReturnValue("blob:receipt");
    URL.revokeObjectURL = jest.fn();
    jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("sends the session token and releases the downloaded blob", async () => {
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    fetchMock.mockResolvedValue({ ok: true, blob: async () => blob });
    await salesApi.downloadReceiptPdf("receipt-1", "SREC-1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/sales/receipts/receipt-1/pdf"),
      {
        headers: { Authorization: "Bearer user-token" },
      },
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:receipt");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("rejects denied downloads without generating a fake document", async () => {
    (getToken as jest.Mock).mockReturnValue(null);
    fetchMock.mockResolvedValue({ ok: false });
    await expect(
      salesApi.downloadReceiptPdf("receipt-1", "SREC-1"),
    ).rejects.toThrow("Failed to download");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
