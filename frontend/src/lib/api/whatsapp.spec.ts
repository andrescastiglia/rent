import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { apiClient } from "../api";
import { getToken, getUser } from "../auth";
import { whatsappApi } from "./whatsapp";

jest.mock("../api", () => ({
  apiClient: { post: jest.fn() },
  IS_MOCK_MODE: false,
}));
jest.mock("../auth", () => ({ getToken: jest.fn(), getUser: jest.fn() }));

const input = {
  requestId: "123e4567-e89b-12d3-a456-426614174003",
  personType: "tenant" as const,
  personId: "123e4567-e89b-12d3-a456-426614174002",
  subject: "Recordatorio",
};
const response = {
  activity: { id: "activity" },
  delivery: { deliveryId: "delivery-1", status: "queued", queued: true },
};
const post = jest.mocked(apiClient.post);
const user = { id: "user", companyId: "company" };

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
  jest.clearAllMocks();
  localStorage.clear();
  jest.mocked(getToken).mockReturnValue("token-123");
  jest.mocked(getUser).mockReturnValue(user);
  post.mockResolvedValue(response);
});

describe("whatsappApi", () => {
  it("creates and queues an activity through one scoped backend command", async () => {
    await expect(whatsappApi.createActivity(input)).resolves.toBe(response);
    expect(post).toHaveBeenCalledWith(
      "/whatsapp/activities",
      { ...input, requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) },
      "token-123",
    );
    expect(localStorage).toHaveLength(0);
  });

  it("retains the activity UUID after a lost response and a reconstructed explicit retry", async () => {
    post.mockRejectedValueOnce(new Error("Lost response"));
    await expect(whatsappApi.createActivity(input)).rejects.toThrow(
      "Lost response",
    );
    const firstCommand = post.mock.calls[0][1] as typeof input;
    expect(localStorage).toHaveLength(1);
    expect(localStorage.key(0)).not.toContain(input.subject);
    await expect(
      whatsappApi.createActivity({ ...input, requestId: crypto.randomUUID() }),
    ).resolves.toBe(response);
    expect(post.mock.calls[1][1]).toEqual(firstCommand);
    expect(localStorage).toHaveLength(0);
    await whatsappApi.createActivity(input);
    expect((post.mock.calls[2][1] as typeof input).requestId).not.toBe(
      firstCommand.requestId,
    );
  });

  it("blocks a changed command while recovery is pending and keeps recovery after a retry rejection", async () => {
    post.mockRejectedValueOnce(new Error("Lost response"));
    await expect(whatsappApi.createActivity(input)).rejects.toThrow(
      "Lost response",
    );
    await expect(
      whatsappApi.createActivity({ ...input, subject: "Changed" }),
    ).rejects.toThrow("uncertain operation");
    expect(post).toHaveBeenCalledTimes(1);
    post.mockRejectedValueOnce({ status: 403 });
    await expect(whatsappApi.createActivity(input)).rejects.toEqual({
      status: 403,
    });
    expect(localStorage).toHaveLength(1);
    await whatsappApi.createActivity(input);
    expect(post.mock.calls[2][1]).toEqual(post.mock.calls[0][1]);
  });

  it("clears a new operation after a definitive validation rejection", async () => {
    post.mockRejectedValueOnce({ status: 422 });
    await expect(whatsappApi.createActivity(input)).rejects.toEqual({
      status: 422,
    });
    expect(localStorage).toHaveLength(0);
    await whatsappApi.createActivity({ ...input, subject: "Corrected" });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("isolates unresolved commands by company, user and recipient", async () => {
    post.mockRejectedValue(new Error("Lost response"));
    await expect(whatsappApi.createActivity(input)).rejects.toThrow(
      "Lost response",
    );
    const first = post.mock.calls[0][1] as typeof input;
    jest
      .mocked(getUser)
      .mockReturnValue({ ...user, companyId: "other-company" });
    await expect(whatsappApi.createActivity(input)).rejects.toThrow(
      "Lost response",
    );
    jest.mocked(getUser).mockReturnValue({ ...user, id: "other-user" });
    await expect(whatsappApi.createActivity(input)).rejects.toThrow(
      "Lost response",
    );
    jest.mocked(getUser).mockReturnValue(user);
    await expect(
      whatsappApi.createActivity({ ...input, personType: "interested" }),
    ).rejects.toThrow("Lost response");
    expect(
      new Set(
        post.mock.calls.map(([, body]) => (body as typeof input).requestId),
      ).size,
    ).toBe(4);
    post.mockResolvedValue(response);
    await whatsappApi.createActivity(input);
    expect(post.mock.calls[4][1]).toEqual(first);
  });

  it("rejects missing identity and unavailable persistence before sending", async () => {
    jest.mocked(getUser).mockReturnValue(null);
    await expect(whatsappApi.createActivity(input)).rejects.toThrow(
      "company context",
    );
    expect(post).not.toHaveBeenCalled();
    jest.mocked(getUser).mockReturnValue(user);
    const storage = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Storage unavailable");
      });
    await expect(whatsappApi.createActivity(input)).rejects.toThrow(
      "Storage unavailable",
    );
    expect(post).not.toHaveBeenCalled();
    storage.mockRestore();
  });

  it("sends standalone messages and propagates delivery errors without automatic retries", async () => {
    jest.mocked(getToken).mockReturnValue(null);
    const message = { to: "+541155555555", text: "Hello" };
    await expect(whatsappApi.sendMessage(message)).resolves.toBe(response);
    expect(post).toHaveBeenCalledWith("/whatsapp/messages", message, undefined);
    post.mockRejectedValueOnce(new Error("Offline"));
    await expect(whatsappApi.sendMessage(message)).rejects.toThrow("Offline");
    expect(post).toHaveBeenCalledTimes(2);
  });
});
