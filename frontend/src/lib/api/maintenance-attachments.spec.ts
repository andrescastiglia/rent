import { maintenanceAttachmentsApi as api } from "./maintenance-attachments";
import { apiClient } from "../api";
import {
  prepareDomainAttempt,
  completeDomainAttempt,
} from "../domain-operation";
jest.mock("../api", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  ApiRequestError: class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
jest.mock("../auth", () => ({
  getUser: () => ({ id: "user", companyId: "company" }),
  getToken: () => "jwt",
}));
jest.mock("../domain-operation", () => ({
  prepareDomainAttempt: jest.fn(),
  completeDomainAttempt: jest.fn(),
}));
const file = {
  name: "foto.png",
  type: "image/png",
  size: 4,
  arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
} as File;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: {
      digest: jest.fn().mockResolvedValue(new Uint8Array([4, 5]).buffer),
    },
  });
  jest.mocked(prepareDomainAttempt).mockResolvedValue({
    storageKey: "saved",
    idempotencyKey: "persisted-key",
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  jest.mocked(apiClient.post).mockResolvedValue({
    status: "pending",
    documentId: "document",
    uploadUrl: "http://localhost:3001/documents/document/content?token=signed",
  });
  jest.mocked(apiClient.patch).mockResolvedValue({});
});
it("scopes authenticated attachment reads to the ticket", async () => {
  await api.list("ticket/id");
  expect(apiClient.get).toHaveBeenCalledWith(
    "/documents/entity/maintenance_ticket/ticket%2Fid",
    "jwt",
  );
});
it("reserves one document, uploads the real bytes, confirms it and clears attempts after success", async () => {
  await api.upload("ticket", file);
  expect(apiClient.post).toHaveBeenCalledWith(
    "/maintenance/tickets/ticket/attachments/upload-url",
    {
      fileName: "foto.png",
      mimeType: "image/png",
      fileSize: 4,
      documentType: "photo",
    },
    "jwt",
    { "Idempotency-Key": "persisted-key" },
  );
  expect(fetch).toHaveBeenCalledWith(
    "http://localhost:3001/documents/document/content?token=signed",
    { method: "PUT", headers: { "Content-Type": "image/png" }, body: file },
  );
  expect(apiClient.patch).toHaveBeenCalledWith(
    "/maintenance/tickets/ticket/attachments/document/confirm",
    {},
    "jwt",
    { "Idempotency-Key": "persisted-key" },
  );
  expect(completeDomainAttempt).toHaveBeenCalledTimes(2);
});
it("keeps an uncertain confirmation key and never retries automatically", async () => {
  jest.mocked(apiClient.patch).mockRejectedValue(new Error("lost"));
  await expect(api.upload("ticket", file)).rejects.toThrow("lost");
  expect(apiClient.patch).toHaveBeenCalledTimes(1);
  expect(completeDomainAttempt).not.toHaveBeenCalled();
});
it("recovers an already approved document without another binary upload", async () => {
  jest
    .mocked(apiClient.post)
    .mockResolvedValue({ status: "approved", documentId: "document" });
  await api.upload("ticket", file);
  expect(fetch).not.toHaveBeenCalled();
  expect(apiClient.patch).not.toHaveBeenCalled();
  expect(completeDomainAttempt).toHaveBeenCalledTimes(1);
});
it.each([
  { ...file, type: "text/html" },
  { ...file, size: 0 },
  { ...file, size: 6 * 1024 * 1024 },
])(
  "rejects invalid file metadata before reserving a document",
  async (input) => {
    await expect(api.upload("ticket", input as File)).rejects.toThrow();
    expect(apiClient.post).not.toHaveBeenCalled();
  },
);
it("blocks foreign capability URLs before transmitting a file", async () => {
  jest.mocked(apiClient.post).mockResolvedValue({
    status: "pending",
    documentId: "document",
    uploadUrl:
      "https://foreign.invalid/documents/document/content?token=signed",
  });
  await expect(api.upload("ticket", file)).rejects.toThrow(
    "Invalid document capability",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("does not download denied documents or invent file content", async () => {
  jest.mocked(apiClient.get).mockRejectedValue(new Error("denied"));
  await expect(
    api.download({
      id: "document",
      name: "test.pdf",
      status: "approved",
      fileMimeType: "application/pdf",
      fileSize: 4,
      createdAt: "2026-10-01",
    }),
  ).rejects.toThrow("denied");
  expect(fetch).not.toHaveBeenCalled();
});
