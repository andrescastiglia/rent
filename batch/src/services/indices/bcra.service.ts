import axios, { AxiosInstance } from "axios";
import https from "node:https";
import { logger } from "../../shared/logger";

/**
 * Response structure from BCRA API for variable data.
 */
interface BcraVariableData {
  idVariable: number;
  fecha: string;
  valor: number;
}

/**
 * Response structure from BCRA API.
 */
interface BcraApiResponse {
  status: number;
  results: BcraVariableData[];
  metadata?: {
    resultset?: {
      count?: number;
      offset?: number;
      limit?: number;
    };
  };
}

/**
 * Parsed ICL index data.
 */
export interface IclIndexData {
  date: Date;
  value: number;
}

/**
 * Service for fetching inflation indices from BCRA.
 * Provides access to ICL (Índice para Contratos de Locación) data.
 *
 * @see https://api.bcra.gob.ar/estadisticas/v3.0
 */
export class BcraService {
  private readonly apiUrl: string;
  private readonly client: AxiosInstance;
  private readonly iclVariableId: number;

  /** BCRA variable ID for ICL index. */
  private static readonly DEFAULT_ICL_VARIABLE_ID = 40;

  /**
   * Creates an instance of BcraService.
   *
   * @param apiUrl - Base URL for BCRA API, defaults to env or official URL.
   */
  constructor(apiUrl?: string) {
    const configuredBase =
      apiUrl || process.env.BCRA_API_URL || "https://api.bcra.gob.ar";
    this.apiUrl = this.normalizeApiUrl(configuredBase);
    const configuredVariableId = Number.parseInt(
      process.env.BCRA_ICL_VARIABLE_ID || "",
      10,
    );
    this.iclVariableId = Number.isFinite(configuredVariableId)
      ? configuredVariableId
      : BcraService.DEFAULT_ICL_VARIABLE_ID;

    const insecureTls = process.env.BCRA_API_INSECURE === "true";

    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000,
      headers: {
        Accept: "application/json",
      },
      ...(insecureTls
        ? {
            httpsAgent: new https.Agent({
              rejectUnauthorized: false,
            }),
          }
        : {}),
    });
  }

  /**
   * Fetches ICL index data for a date range.
   *
   * @param fromDate - Start date of the range.
   * @param toDate - End date of the range.
   * @returns Array of ICL index data points.
   * @throws Error if API request fails.
   */
  async getIcl(fromDate: Date, toDate: Date): Promise<IclIndexData[]> {
    const from = this.formatDate(fromDate);
    const to = this.formatDate(toDate);

    const endpoint = `/monetarias/${this.iclVariableId}`;

    logger.info("Fetching ICL data from BCRA", { from, to, endpoint });

    try {
      const response = await this.client.get<BcraApiResponse>(endpoint, {
        params: {
          desde: from,
          hasta: to,
          limit: 5000,
        },
      });

      if (!response.data.results || response.data.results.length === 0) {
        logger.warn("No ICL data returned from BCRA", { from, to });
        return [];
      }

      const data = response.data.results.map((item) => ({
        date: this.parseDate(item.fecha),
        value: item.valor,
      }));

      logger.info("Successfully fetched ICL data", {
        count: data.length,
        from,
        to,
      });

      return data;
    } catch (error) {
      logger.error("Failed to fetch ICL data from BCRA", {
        error: error instanceof Error ? error.message : error,
        endpoint,
      });
      throw error;
    }
  }

  /**
   * Fetches the latest ICL index value.
   *
   * @returns The most recent ICL index data, or null if not available.
   */
  async getLatestIcl(): Promise<IclIndexData | null> {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - 3);

    const data = await this.getIcl(fromDate, toDate);

    if (data.length === 0) {
      return null;
    }

    // Return the most recent value
    const sortedData = [...data].sort(
      (a: IclIndexData, b: IclIndexData) => b.date.getTime() - a.date.getTime(),
    );
    return sortedData[0];
  }

  /**
   * Formats a date as YYYY-MM-DD for BCRA API.
   */
  private formatDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Parses a date string from BCRA API.
   */
  private parseDate(dateStr: string): Date {
    if (dateStr.includes("-")) {
      const [year, month, day] = dateStr.split("-").map(Number);
      return new Date(Date.UTC(year, month - 1, day));
    }
    const [day, month, year] = dateStr.split("/").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private normalizeApiUrl(url: string): string {
    const trimmed = url.replace(/\/+$/, "");
    if (/\/estadisticas\/v\d+(\.\d+)?$/i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}/estadisticas/v3.0`;
  }
}
