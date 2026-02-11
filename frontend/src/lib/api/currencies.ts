import { Currency } from "@/types/lease";
import { apiClient } from "../api";
import { getToken } from "../auth";

// Mock data for development/testing
const MOCK_CURRENCIES: Currency[] = [
  { code: "ARS", symbol: "$", decimalPlaces: 2, isActive: true },
  { code: "BRL", symbol: "R$", decimalPlaces: 2, isActive: true },
  { code: "USD", symbol: "US$", decimalPlaces: 2, isActive: true },
];

// Locale to default currency mapping
const LOCALE_DEFAULTS: Record<string, string> = {
  es: "ARS",
  pt: "BRL",
  en: "USD",
};

// Use mock data in test/CI environments, real API in production
const IS_MOCK_MODE =
  process.env.NODE_ENV === "test" ||
  process.env.NEXT_PUBLIC_MOCK_MODE === "true" ||
  process.env.CI === "true";

const DELAY = 100;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const currenciesApi = {
  getAll: async (): Promise<Currency[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return MOCK_CURRENCIES.filter((c) => c.isActive);
    }

    const token = getToken();
    return apiClient.get<Currency[]>("/currencies", token ?? undefined);
  },

  getByCode: async (code: string): Promise<Currency | null> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return MOCK_CURRENCIES.find((c) => c.code === code.toUpperCase()) || null;
    }

    const token = getToken();
    try {
      return await apiClient.get<Currency>(
        `/currencies/${code.toUpperCase()}`,
        token ?? undefined,
      );
    } catch {
      return null;
    }
  },

  getDefaultForLocale: async (locale: string): Promise<Currency> => {
    const code = LOCALE_DEFAULTS[locale] || "USD";
    const currency = await currenciesApi.getByCode(code);
    return (
      currency || {
        code: "USD",
        symbol: "US$",
        decimalPlaces: 2,
        isActive: true,
      }
    );
  },
};
