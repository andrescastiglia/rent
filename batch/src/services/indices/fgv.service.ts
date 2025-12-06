import axios, { AxiosInstance } from 'axios';
import { logger } from '../../shared/logger';

/**
 * Response structure from BCB API for series data.
 */
interface BcbSeriesData {
    data: string;
    valor: string;
}

/**
 * Parsed IGP-M index data.
 */
export interface IgpmIndexData {
    date: Date;
    value: number;
}

/**
 * Service for fetching inflation indices from BCB (Banco Central do Brasil).
 * Provides access to IGP-M (Índice Geral de Preços - Mercado) data.
 *
 * @see https://api.bcb.gov.br/dados/serie
 */
export class FgvService {
    private readonly apiUrl: string;
    private readonly client: AxiosInstance;

    /** BCB series code for IGP-M index. */
    private static readonly IGPM_SERIES_CODE = 189;

    /**
     * Creates an instance of FgvService.
     *
     * @param apiUrl - Base URL for BCB API, defaults to env or official URL.
     */
    constructor(apiUrl?: string) {
        this.apiUrl =
            apiUrl ||
            process.env.BCB_API_URL ||
            'https://api.bcb.gov.br/dados/serie';

        this.client = axios.create({
            baseURL: this.apiUrl,
            timeout: 30000,
            headers: {
                Accept: 'application/json',
            },
        });
    }

    /**
     * Fetches IGP-M index data for a date range.
     *
     * @param fromDate - Start date of the range.
     * @param toDate - End date of the range.
     * @returns Array of IGP-M index data points.
     * @throws Error if API request fails.
     */
    async getIgpm(fromDate: Date, toDate: Date): Promise<IgpmIndexData[]> {
        const dataInicial = this.formatDate(fromDate);
        const dataFinal = this.formatDate(toDate);

        const endpoint = `/bcdata.sgs.${FgvService.IGPM_SERIES_CODE}/dados`;

        logger.info('Fetching IGP-M data from BCB', {
            dataInicial,
            dataFinal,
            endpoint,
        });

        try {
            const response = await this.client.get<BcbSeriesData[]>(endpoint, {
                params: {
                    formato: 'json',
                    dataInicial,
                    dataFinal,
                },
            });

            if (!response.data || response.data.length === 0) {
                logger.warn('No IGP-M data returned from BCB', {
                    dataInicial,
                    dataFinal,
                });
                return [];
            }

            const data = response.data.map((item) => ({
                date: this.parseDate(item.data),
                value: Number.parseFloat(item.valor),
            }));

            logger.info('Successfully fetched IGP-M data', {
                count: data.length,
                dataInicial,
                dataFinal,
            });

            return data;
        } catch (error) {
            logger.error('Failed to fetch IGP-M data from BCB', {
                error: error instanceof Error ? error.message : error,
                endpoint,
            });
            throw error;
        }
    }

    /**
     * Fetches the latest IGP-M index value.
     *
     * @returns The most recent IGP-M index data, or null if not available.
     */
    async getLatestIgpm(): Promise<IgpmIndexData | null> {
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 3);

        const data = await this.getIgpm(fromDate, toDate);

        if (data.length === 0) {
            return null;
        }

        // Return the most recent value
        const sortedData = [...data].sort(
            (a: IgpmIndexData, b: IgpmIndexData) => b.date.getTime() - a.date.getTime()
        );
        return sortedData[0];
    }

    /**
     * Formats a date as DD/MM/YYYY for BCB API.
     */
    private formatDate(date: Date): string {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    /**
     * Parses a date string from BCB API (DD/MM/YYYY format).
     */
    private parseDate(dateStr: string): Date {
        const [day, month, year] = dateStr.split('/').map(Number);
        return new Date(year, month - 1, day);
    }
}
