import { WhatsappService } from "./whatsapp.service";

jest.mock("../shared/logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe("WhatsappService", () => {
  const originalEnv = process.env;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      PORT: "3010",
      BATCH_WHATSAPP_INTERNAL_TOKEN: "internal-token",
    };
    Object.defineProperty(global, "fetch", {
      writable: true,
      value: fetchMock,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns config error when token is missing", async () => {
    delete process.env.BATCH_WHATSAPP_INTERNAL_TOKEN;
    const service = new WhatsappService();

    const result = await service.sendTextMessage("54911", "hola");

    expect(result).toEqual({
      success: false,
      error: "BATCH_WHATSAPP_INTERNAL_TOKEN not configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends message successfully and returns messageId", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-123" }),
    });
    const service = new WhatsappService();

    const result = await service.sendTextMessage(
      "54911",
      "hola",
      "https://files/doc.pdf",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3010/whatsapp/messages/internal",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-batch-whatsapp-token": "internal-token",
        },
        body: JSON.stringify({
          to: "54911",
          text: "hola",
          pdfUrl: "https://files/doc.pdf",
        }),
      },
    );
    expect(result).toEqual({ success: true, messageId: "msg-123" });
  });

  it("returns HTTP error detail from backend response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "provider failed" }),
    });
    const service = new WhatsappService();

    const result = await service.sendTextMessage("54911", "hola");

    expect(result).toEqual({ success: false, error: "provider failed" });
  });

  it("handles invalid JSON and request exceptions", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("bad json");
        },
      })
      .mockRejectedValueOnce(new Error("network down"));

    const service = new WhatsappService();

    const responseError = await service.sendTextMessage("54911", "hola");
    const requestError = await service.sendTextMessage("54911", "hola");

    expect(responseError).toEqual({ success: false, error: "HTTP 502" });
    expect(requestError).toEqual({ success: false, error: "network down" });
  });
});
