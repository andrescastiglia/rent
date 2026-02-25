import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import type { Currency } from '@/types/lease';

const MOCK_CURRENCIES: Currency[] = [
  { code: 'ARS', symbol: '$', decimalPlaces: 2, isActive: true },
  { code: 'USD', symbol: 'US$', decimalPlaces: 2, isActive: true },
  { code: 'BRL', symbol: 'R$', decimalPlaces: 2, isActive: true },
];

export const currenciesApi = {
  async getAll(): Promise<Currency[]> {
    if (IS_MOCK_MODE) {
      return MOCK_CURRENCIES;
    }

    return apiClient.get<Currency[]>('/currencies');
  },
};
