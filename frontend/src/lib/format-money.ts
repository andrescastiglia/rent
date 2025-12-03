import { Currency } from '@/types/lease';

/**
 * Format a monetary amount with its currency symbol
 * @param amount - The numeric amount to format
 * @param currency - Currency object with symbol and decimal places
 * @param locale - Locale string for number formatting (e.g., 'es', 'en', 'pt')
 * @returns Formatted string like "$ 1.500,00" or "US$ 1,500.00"
 */
export function formatMoney(
    amount: number,
    currency: Currency | undefined,
    locale: string = 'es'
): string {
    const symbol = currency?.symbol || '$';
    const decimalPlaces = currency?.decimalPlaces ?? 2;

    // Map short locale to full locale for proper formatting
    const localeMap: Record<string, string> = {
        es: 'es-AR',
        pt: 'pt-BR',
        en: 'en-US',
    };

    const fullLocale = localeMap[locale] || locale;

    const formattedNumber = amount.toLocaleString(fullLocale, {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
    });

    return `${symbol} ${formattedNumber}`;
}

/**
 * Format money using just the currency code (when full currency data isn't available)
 * @param amount - The numeric amount to format
 * @param currencyCode - ISO 4217 currency code (e.g., 'ARS', 'USD')
 * @param locale - Locale string for number formatting
 * @returns Formatted string
 */
export function formatMoneyByCode(
    amount: number,
    currencyCode: string = 'ARS',
    locale: string = 'es'
): string {
    const symbols: Record<string, string> = {
        ARS: '$',
        BRL: 'R$',
        USD: 'US$',
    };

    const currency: Currency = {
        code: currencyCode,
        symbol: symbols[currencyCode] || currencyCode,
        decimalPlaces: 2,
        isActive: true,
    };

    return formatMoney(amount, currency, locale);
}
