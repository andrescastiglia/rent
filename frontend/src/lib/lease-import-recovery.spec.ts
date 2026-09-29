import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import {
  completeLeaseImport,
  prepareLeaseImport,
  submitLeaseImport,
} from "./lease-import-recovery";
import { leasesApi } from "./api/leases";
import { apiClient } from "./api";
jest.mock("./api", () => ({ apiClient: { post: jest.fn() } }));
jest.mock("./auth", () => ({
  getToken: () => "session-token",
  getUser: () => null,
}));
import type { ImportCurrentLeaseInput } from "@/types/lease";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
  Object.defineProperty(globalThis, "TextEncoder", {
    value: TextEncoder,
    configurable: true,
  });
});
beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());

function input(contents = "original contract"): ImportCurrentLeaseInput {
  const file = new File([contents], "contract.txt", { type: "text/plain" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new TextEncoder().encode(contents).buffer,
  });
  return {
    propertyId: "property",
    contractType: "rental",
    tenantId: "tenant",
    file,
  };
}

it("recovers the same pending key after rebuilding form and file objects", async () => {
  const first = await prepareLeaseImport("company", "user", input());
  const retry = await prepareLeaseImport("company", "user", input());
  expect(retry).toEqual(first);
  expect(localStorage.length).toBe(1);
  expect(first.storageKey).not.toContain("original contract");
  expect(first.storageKey).not.toContain("contract.txt");
  expect(localStorage.getItem(first.storageKey)).toBe(first.idempotencyKey);
});

it("separates file bytes, terms, company and user without overwriting an uncertain attempt", async () => {
  const first = await prepareLeaseImport("company", "user", input());
  const alternatives = await Promise.all([
    prepareLeaseImport("company", "user", input("altered contract")),
    prepareLeaseImport("company", "user", { ...input(), rentAmount: 200 }),
    prepareLeaseImport("other-company", "user", input()),
    prepareLeaseImport("company", "other-user", input()),
  ]);
  expect(
    new Set([first, ...alternatives].map((value) => value.idempotencyKey)).size,
  ).toBe(5);
  expect(await prepareLeaseImport("company", "user", input())).toEqual(first);
});

it("removes only a successfully completed attempt", async () => {
  const first = await prepareLeaseImport("company", "user", input());
  completeLeaseImport(first);
  expect(localStorage.getItem(first.storageKey)).toBeNull();
  expect(
    (await prepareLeaseImport("company", "user", input())).idempotencyKey,
  ).not.toBe(first.idempotencyKey);
  completeLeaseImport(first);
  expect(localStorage.length).toBe(1);
});

it("stops before submission when storage cannot preserve a retry key", async () => {
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage unavailable");
  });
  await expect(prepareLeaseImport("company", "user", input())).rejects.toThrow(
    "storage unavailable",
  );
});

it("does not silently replace a corrupted pending key", async () => {
  const attempt = await prepareLeaseImport("company", "user", input());
  localStorage.setItem(attempt.storageKey, "corrupted");
  await expect(prepareLeaseImport("company", "user", input())).rejects.toThrow(
    "no es válida",
  );
});

it("requires company and user scope and tolerates cleanup failure after success", async () => {
  await expect(prepareLeaseImport("", "user", input())).rejects.toThrow(
    "sesión",
  );
  const attempt = await prepareLeaseImport("company", "user", input());
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new Error("storage unavailable");
  });
  expect(() => completeLeaseImport(attempt)).not.toThrow();
  expect(localStorage.getItem(attempt.storageKey)).toBe(attempt.idempotencyKey);
});

it("sends the same multipart key and file on retry after a lost response, then clears the attempt", async () => {
  jest
    .mocked(apiClient.post)
    .mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce({
      id: "imported",
      status: "active",
      contractType: "rental",
    });
  await expect(
    submitLeaseImport(
      "company",
      "user",
      input(),
      leasesApi.importCurrentContract,
    ),
  ).rejects.toThrow("response lost");
  expect(localStorage.length).toBe(1);
  const result = await submitLeaseImport(
    "company",
    "user",
    input(),
    leasesApi.importCurrentContract,
  );
  const first = jest.mocked(apiClient.post).mock.calls[0];
  const retry = jest.mocked(apiClient.post).mock.calls[1];
  expect(first[0]).toBe("/contracts/import-current");
  expect(first[2]).toBe("session-token");
  expect((first[1] as FormData).get("idempotencyKey")).toBe(
    (retry[1] as FormData).get("idempotencyKey"),
  );
  expect((retry[1] as FormData).get("file")).toBeInstanceOf(File);
  expect((retry[1] as FormData).get("tenantId")).toBe("tenant");
  expect(result.id).toBe("imported");
  expect(localStorage.length).toBe(0);
});

it("does not submit an import when the browser cannot persist recovery information", async () => {
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage unavailable");
  });
  await expect(
    submitLeaseImport(
      "company",
      "user",
      input(),
      leasesApi.importCurrentContract,
    ),
  ).rejects.toThrow("storage unavailable");
  expect(apiClient.post).not.toHaveBeenCalled();
});
