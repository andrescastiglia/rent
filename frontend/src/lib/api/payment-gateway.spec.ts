export {};

type MockedPaymentGatewayApiClient = { post: jest.Mock };

async function loadApi(mockMode: boolean, token: string | null = null) {
  jest.resetModules();
  const apiClient: MockedPaymentGatewayApiClient = { post: jest.fn() };
  jest.doMock("../api", () => ({ apiClient, IS_MOCK_MODE: mockMode }));
  jest.doMock("../auth", () => ({ getToken: jest.fn(() => token) }));
  const { paymentGatewayApi } = await import("./payment-gateway");
  return { paymentGatewayApi, apiClient };
}

describe("paymentGatewayApi", () => {
  it("returns a sandbox preference in mock mode", async () => {
    const { paymentGatewayApi, apiClient } = await loadApi(true);

    const preference = await paymentGatewayApi.createPreference("inv 1");

    expect(preference.transactionId).toBe("mock-transaction-inv 1");
    expect(preference.initPoint).toContain("pref_id=mock-inv%201");
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("uses mock mode for mock authentication tokens", async () => {
    const { paymentGatewayApi, apiClient } = await loadApi(
      false,
      "mock-token-user",
    );

    await paymentGatewayApi.createPreference("inv-1");

    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("creates a preference through the authenticated API", async () => {
    const { paymentGatewayApi, apiClient } = await loadApi(false, "real-token");
    apiClient.post.mockResolvedValue({
      initPoint: "https://mercadopago.example/checkout",
      sandboxInitPoint: "https://sandbox.example/checkout",
      transactionId: "transaction-1",
    });

    const result = await paymentGatewayApi.createPreference("inv-1");

    expect(apiClient.post).toHaveBeenCalledWith(
      "/payment-gateway/preferences",
      { invoiceId: "inv-1" },
      "real-token",
    );
    expect(result.transactionId).toBe("transaction-1");
  });
});
