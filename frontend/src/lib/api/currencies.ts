import { Currency } from '@/types/lease';

// Mock data for development
const MOCK_CURRENCIES: Currency[] = [
    { code: 'ARS', symbol: '$', decimalPlaces: 2, isActive: true },
    { code: 'BRL', symbol: 'R$', decimalPlaces: 2, isActive: true },
    { code: 'USD', symbol: 'US$', decimalPlaces: 2, isActive: true },
];

// Locale to default currency mapping
const LOCALE_DEFAULTS: Record<string, string> = {
    es: 'ARS',
    pt: 'BRL',
    en: 'USD',
};

const DELAY = 100;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const currenciesApi = {
    getAll: async (): Promise<Currency[]> => {
        await delay(DELAY);
        return MOCK_CURRENCIES.filter(c => c.isActive);
    },

    getByCode: async (code: string): Promise<Currency | null> => {
        await delay(DELAY);
        return MOCK_CURRENCIES.find(c => c.code === code.toUpperCase()) || null;
    },

    getDefaultForLocale: async (locale: string): Promise<Currency> => {
        await delay(DELAY);
        const code = LOCALE_DEFAULTS[locale] || 'USD';
        return MOCK_CURRENCIES.find(c => c.code === code) || MOCK_CURRENCIES[2]; // Fallback to USD
    },
};
