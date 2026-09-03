import { apiClient } from "../api";
import { getToken } from "../auth";
import { whatsappApi } from "./whatsapp";

jest.mock("../api", () => ({
  apiClient: { post: jest.fn() },
  IS_MOCK_MODE: false,
}));

jest.mock("../auth", () => ({ getToken: jest.fn() }));

describe("whatsappApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getToken as jest.Mock).mockReturnValue("token-123");
  });

  it("creates and queues an activity through one backend command", async () => {
    const input = {
      requestId: "123e4567-e89b-12d3-a456-426614174003",
      personType: "tenant" as const,
      personId: "123e4567-e89b-12d3-a456-426614174002",
      subject: "Recordatorio",
    };
    const response = {
      activity: { id: input.requestId },
      delivery: { deliveryId: "delivery-1", status: "queued", queued: true },
    };
    (apiClient.post as jest.Mock).mockResolvedValue(response);

    await expect(whatsappApi.createActivity(input)).resolves.toBe(response);
    expect(apiClient.post).toHaveBeenCalledWith(
      "/whatsapp/activities",
      input,
      "token-123",
    );
  });
});
