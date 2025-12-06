import axios, { AxiosInstance } from 'axios';
import { AppDataSource } from '../shared/database';
import { logger } from '../shared/logger';

/**
 * Result of a currency conversion.
 */
export interface ConversionResult {
    amount: number;
    rate: number;
    originalAmount: number;
    fromCurrency: string;
    toCurrency: string;
    rateDate: Date;
}

/**
 * Exchange rate data structure.
 */
export interface ExchangeRateData {
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    rateDate: Date;
    source: string;
}

/**
 * Service for managing exchange rates and currency conversions.
 * Supports USD/ARS, BRL/ARS from BCRA and USD/BRL from BCB.
 */
export class ExchangeRateService {
    private readonly bcraApiUrl: string;
    private readonly bcbApiUrl: string;
    private readonly bcraClient: AxiosInstance;
    private readonly bcbClient: AxiosInstance;

    /** BCRA variable IDs for exchange rates. */
    private static readonly BCRA_USD_ARS_ID = 4;
    private static readonly BCRA_BRL_ARS_ID = 12;

    /** BCB series code for USD/BRL. */
    private static readonly BCB_USD_BRL_SERIES = 1;

    /**
     * Creates an instance of ExchangeRateService.
     */
    constructor() {
        this.bcraApiUrl =
            process.env.BCRA_API_URL ||
            'https://api.bcra.gob.ar/estadisticas/v2.0';

        this.bcbApiUrl =
            process.env.BCB_API_URL ||
            'https://api.bcb.gov.br/dados/serie';

        this.bcraClient = axios.create({
            baseURL: this.bcraApiUrl,
            timeout: 30000,
            headers: { Accept: 'application/json' },
        });

        this.bcbClient = axios.create({
            baseURL: this.bcbApiUrl,
            timeout: 30000,
            headers: { Accept: 'application/json' },
        });
    }

    /**
     * Gets the exchange rate for a currency pair on a specific date.
     * First checks the database cache, then fetches from API if not found.
     *
     * @param fromCurrency - Source currency code (e.g., 'USD').
     * @param toCurrency - Target currency code (e.g., 'ARS').
     * @param date - Date for the exchange rate.
     * @returns The exchange rate.
     */
    async getRate(
        fromCurrency: string,
        toCurrency: string,
        date: Date
    ): Promise<number> {
        // Check cache first
        const cached = await this.findCachedRate(fromCurrency, toCurrency, date);
        if (cached) {
            return cached.rate;
        }

        // Fetch from API
        const rate = await this.fetchFromApi(fromCurrency, toCurrency, date);

        // Save to cache
        await this.saveRate(fromCurrency, toCurrency, date, rate, 'API');

        return rate;
    }

    /**
     * Converts an amount from one currency to another.
     *
     * @param amount - Amount to convert.
     * @param fromCurrency - Source currency code.
     * @param toCurrency - Target currency code.
     * @param date - Date for the exchange rate.
     * @returns Conversion result with amount, rate, and original values.
     */
    async convertAmount(
        amount: number,
        fromCurrency: string,
        toCurrency: string,
        date: Date
    ): Promise<ConversionResult> {
        if (fromCurrency === toCurrency) {
            return {
                amount,
                rate: 1,
                originalAmount: amount,
                fromCurrency,
                toCurrency,
                rateDate: date,
            };
        }

        const rate = await this.getRate(fromCurrency, toCurrency, date);
        const convertedAmount = Math.round(amount * rate * 100) / 100;

        return {
            amount: convertedAmount,
            rate,
            originalAmount: amount,
            fromCurrency,
            toCurrency,
            rateDate: date,
        };
    }

    /**
     * Synchronizes exchange rates from external APIs.
     * Fetches USD/ARS and BRL/ARS from BCRA, USD/BRL from BCB.
     *
     * @returns Number of rates synchronized.
     */
    async syncRates(): Promise<{
        processed: number;
        inserted: number;
        errors: string[];
    }> {
        const result = { processed: 0, inserted: 0, errors: [] as string[] };

        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 1);

        // Sync USD/ARS from BCRA
        try {
            const usdArsRates = await this.fetchBcraRates(
                'USD',
                'ARS',
                ExchangeRateService.BCRA_USD_ARS_ID,
                fromDate,
                toDate
            );
            for (const rateData of usdArsRates) {
                result.processed++;
                const saved = await this.upsertRate(rateData);
                if (saved) result.inserted++;
            }
        } catch (error) {
            const msg = `USD/ARS sync failed: ${error instanceof Error ? error.message : error}`;
            result.errors.push(msg);
            logger.error(msg);
        }

        // Sync BRL/ARS from BCRA
        try {
            const brlArsRates = await this.fetchBcraRates(
                'BRL',
                'ARS',
                ExchangeRateService.BCRA_BRL_ARS_ID,
                fromDate,
                toDate
            );
            for (const rateData of brlArsRates) {
                result.processed++;
                const saved = await this.upsertRate(rateData);
                if (saved) result.inserted++;
            }
        } catch (error) {
            const msg = `BRL/ARS sync failed: ${error instanceof Error ? error.message : error}`;
            result.errors.push(msg);
            logger.error(msg);
        }

        // Sync USD/BRL from BCB
        try {
            const usdBrlRates = await this.fetchBcbRates(
                'USD',
                'BRL',
                ExchangeRateService.BCB_USD_BRL_SERIES,
                fromDate,
                toDate
            );
            for (const rateData of usdBrlRates) {
                result.processed++;
                const saved = await this.upsertRate(rateData);
                if (saved) result.inserted++;
            }
        } catch (error) {
            const msg = `USD/BRL sync failed: ${error instanceof Error ? error.message : error}`;
            result.errors.push(msg);
            logger.error(msg);
        }

        logger.info('Exchange rates sync completed', result);
        return result;
    }

    /**
     * Fetches exchange rates from BCRA API.
     */
    private async fetchBcraRates(
        fromCurrency: string,
        toCurrency: string,
        variableId: number,
        fromDate: Date,
        toDate: Date
    ): Promise<ExchangeRateData[]> {
        const from = this.formatDateBcra(fromDate);
        const to = this.formatDateBcra(toDate);

        const endpoint = `/datosvariable/${variableId}/${from}/${to}`;

        logger.info('Fetching exchange rates from BCRA', {
            fromCurrency,
            toCurrency,
            endpoint,
        });

        const response = await this.bcraClient.get(endpoint);

        if (!response.data.results || response.data.results.length === 0) {
            return [];
        }

        return response.data.results.map((item: { fecha: string; valor: number }) => ({
            fromCurrency,
            toCurrency,
            rate: item.valor,
            rateDate: this.parseDateBcra(item.fecha),
            source: 'BCRA',
        }));
    }

    /**
     * Fetches exchange rates from BCB API.
     */
    private async fetchBcbRates(
        fromCurrency: string,
        toCurrency: string,
        seriesCode: number,
        fromDate: Date,
        toDate: Date
    ): Promise<ExchangeRateData[]> {
        const dataInicial = this.formatDateBcb(fromDate);
        const dataFinal = this.formatDateBcb(toDate);

        const endpoint = `/bcdata.sgs.${seriesCode}/dados`;

        logger.info('Fetching exchange rates from BCB', {
            fromCurrency,
            toCurrency,
            endpoint,
        });

        const response = await this.bcbClient.get(endpoint, {
            params: { formato: 'json', dataInicial, dataFinal },
        });

        if (!response.data || response.data.length === 0) {
            return [];
        }

        return response.data.map((item: { data: string; valor: string }) => ({
            fromCurrency,
            toCurrency,
            rate: Number.parseFloat(item.valor),
            rateDate: this.parseDateBcb(item.data),
            source: 'BCB',
        }));
    }

    /**
     * Fetches rate from API based on currency pair.
     */
    private async fetchFromApi(
        fromCurrency: string,
        toCurrency: string,
        date: Date
    ): Promise<number> {
        // Try BCRA for ARS pairs
        if (toCurrency === 'ARS') {
            if (fromCurrency === 'USD') {
                const rates = await this.fetchBcraRates(
                    'USD',
                    'ARS',
                    ExchangeRateService.BCRA_USD_ARS_ID,
                    date,
                    date
                );
                if (rates.length > 0) return rates[0].rate;
            }
            if (fromCurrency === 'BRL') {
                const rates = await this.fetchBcraRates(
                    'BRL',
                    'ARS',
                    ExchangeRateService.BCRA_BRL_ARS_ID,
                    date,
                    date
                );
                if (rates.length > 0) return rates[0].rate;
            }
        }

        // Try BCB for BRL pairs
        if (toCurrency === 'BRL' && fromCurrency === 'USD') {
            const rates = await this.fetchBcbRates(
                'USD',
                'BRL',
                ExchangeRateService.BCB_USD_BRL_SERIES,
                date,
                date
            );
            if (rates.length > 0) return rates[0].rate;
        }

        throw new Error(
            `No exchange rate available for ${fromCurrency}/${toCurrency} on ${date.toISOString()}`
        );
    }

    /**
     * Finds a cached rate in the database.
     */
    private async findCachedRate(
        fromCurrency: string,
        toCurrency: string,
        date: Date
    ): Promise<{ rate: number } | null> {
        const result = await AppDataSource.query(
            `SELECT rate 
             FROM exchange_rates 
             WHERE from_currency = $1 
               AND to_currency = $2 
               AND rate_date <= $3
             ORDER BY rate_date DESC 
             LIMIT 1`,
            [fromCurrency, toCurrency, date]
        );

        if (result.length === 0) {
            return null;
        }

        return { rate: Number.parseFloat(result[0].rate) };
    }

    /**
     * Saves a rate to the database cache.
     */
    private async saveRate(
        fromCurrency: string,
        toCurrency: string,
        date: Date,
        rate: number,
        source: string
    ): Promise<void> {
        await this.upsertRate({
            fromCurrency,
            toCurrency,
            rate,
            rateDate: date,
            source,
        });
    }

    /**
     * Upserts an exchange rate record.
     */
    private async upsertRate(data: ExchangeRateData): Promise<boolean> {
        try {
            const result = await AppDataSource.query(
                `INSERT INTO exchange_rates (from_currency, to_currency, rate, rate_date, source, fetched_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 ON CONFLICT (from_currency, to_currency, rate_date, source) 
                 DO UPDATE SET rate = EXCLUDED.rate,
                               fetched_at = NOW(),
                               updated_at = NOW()
                 RETURNING (xmax = 0) AS inserted`,
                [
                    data.fromCurrency,
                    data.toCurrency,
                    data.rate,
                    data.rateDate,
                    data.source,
                ]
            );

            return result[0]?.inserted || false;
        } catch (error) {
            logger.error('Failed to upsert exchange rate', {
                data,
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Formats a date as YYYY-MM-DD for BCRA API.
     */
    private formatDateBcra(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Formats a date as DD/MM/YYYY for BCB API.
     */
    private formatDateBcb(date: Date): string {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    /**
     * Parses a date string from BCRA API (DD/MM/YYYY format).
     */
    private parseDateBcra(dateStr: string): Date {
        const [day, month, year] = dateStr.split('/').map(Number);
        return new Date(year, month - 1, day);
    }

    /**
     * Parses a date string from BCB API (DD/MM/YYYY format).
     */
    private parseDateBcb(dateStr: string): Date {
        const [day, month, year] = dateStr.split('/').map(Number);
        return new Date(year, month - 1, day);
    }
}
