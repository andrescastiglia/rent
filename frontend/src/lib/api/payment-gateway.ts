import { PaymentPreference } from "@/types/payment";
import { apiClient, IS_MOCK_MODE } from "../api";
import { getToken } from "../auth";

const shouldUseMock = (): boolean =>
  IS_MOCK_MODE || (getToken()?.startsWith("mock-token-") ?? false);

export const paymentGatewayApi = {
  createPreference: async (invoiceId: string): Promise<PaymentPreference> => {
    if (shouldUseMock()) {
      const initPoint = `https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=mock-${encodeURIComponent(invoiceId)}`;
      return {
        initPoint,
        sandboxInitPoint: initPoint,
        transactionId: `mock-transaction-${invoiceId}`,
      };
    }

    const token = getToken();
    return apiClient.post<PaymentPreference>(
      "/payment-gateway/preferences",
      { invoiceId },
      token ?? undefined,
    );
  },
};
