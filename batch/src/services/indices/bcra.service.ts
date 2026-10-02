import axios, { AxiosError, AxiosInstance } from "axios";
import { logger } from "../../shared/logger";
import { parseIndexPoint } from "./index-point";

/**
 * Response structure from BCRA API for variable data.
 */
interface BcraVariableData {
  idVariable: number;
  fecha: string;
  valor: number;
}

interface BcraV4VariableData {
  idVariable: number;
  detalle: BcraVariableData[];
}

/**
 * Response structure from BCRA API.
 */
interface BcraApiResponse {
  status: number;
  results: Array<BcraVariableData | BcraV4VariableData>;
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

    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000,
      headers: {
        Accept: "application/json",
      },
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
    if (this.iclVariableId !== 40)
      throw new Error("Only BCRA series 40 is supported as ICL");
    const from = this.formatDate(fromDate);
    const to = this.formatDate(toDate);
    const candidates: Array<{
      endpoint: string;
      params?: Record<string, string | number>;
    }> = [
      {
        endpoint: `/monetarias/${this.iclVariableId}`,
        params: { desde: from, hasta: to, limit: 3000 },
      },
      {
        endpoint: `/datosvariable/${this.iclVariableId}/${from}/${to}`,
      },
    ];

    let lastError: unknown = null;

    for (const candidate of candidates) {
      logger.info("Fetching ICL data from BCRA", {
        from,
        to,
        endpoint: candidate.endpoint,
      });

      try {
        const response = await this.client.get<BcraApiResponse>(
          candidate.endpoint,
          candidate.params ? { params: candidate.params } : undefined,
        );

        const results = this.normalizeResults(response.data.results);
        this.assertCompleteResponse(
          results,
          response.data.metadata?.resultset?.count,
        );
        if (results.length === 0) {
          logger.warn("No ICL data returned from BCRA", {
            from,
            to,
            endpoint: candidate.endpoint,
          });
          return [];
        }

        const data = results.map((item) =>
          parseIndexPoint(item.fecha, item.valor, "level"),
        );

        logger.info("Successfully fetched ICL data", {
          count: data.length,
          from,
          to,
          endpoint: candidate.endpoint,
        });

        return data;
      } catch (error) {
        lastError = error;
        if (this.isBadRequest(error)) {
          logger.warn("ICL endpoint rejected request, trying fallback", {
            endpoint: candidate.endpoint,
            status: error.response?.status,
            responseData: error.response?.data,
          });
          continue;
        }

        logger.error("Failed to fetch ICL data from BCRA", {
          error: this.errorMessage(error),
          endpoint: candidate.endpoint,
          status: this.extractStatus(error),
          responseData: this.extractResponseData(error),
        });
        throw error;
      }
    }

    logger.error("Failed to fetch ICL data from BCRA", {
      error: this.errorMessage(lastError),
      status: this.extractStatus(lastError),
      responseData: this.extractResponseData(lastError),
      variableId: this.iclVariableId,
    });
    throw lastError instanceof Error
      ? lastError
      : new Error("Unable to fetch ICL data from BCRA");
  }

  provenance() {
    return {
      source: "BCRA",
      series: `BCRA:${this.iclVariableId}`,
      url: `${this.apiUrl}/monetarias/${this.iclVariableId}`,
    };
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
    const trimmed = url.replace(/\/+$/, ""); // NOSONAR
    if (/\/estadisticas\/v\d+(\.\d+)?$/i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}/estadisticas/v4.0`;
  }

  private errorMessage(error: unknown): unknown {
    return error instanceof Error ? error.message : error;
  }

  private assertCompleteResponse(
    results: BcraVariableData[],
    count?: number,
  ): void {
    if (results.length >= 3000 || (count ?? results.length) > results.length)
      throw new Error("Incomplete ICL response; use a smaller date range");
  }

  private normalizeResults(
    results: Array<BcraVariableData | BcraV4VariableData> | undefined,
  ): BcraVariableData[] {
    if (!Array.isArray(results)) {
      throw new TypeError("Invalid ICL response");
    }

    return results.flatMap((item) => {
      if (item.idVariable !== undefined && item.idVariable !== 40)
        throw new Error("Unexpected ICL series");
      if ("detalle" in item) {
        if (!Array.isArray(item.detalle))
          throw new TypeError("Invalid ICL detail");
        return item.detalle;
      }
      return item;
    });
  }

  private isBadRequest(error: unknown): error is AxiosError {
    return (
      axios.isAxiosError(error) &&
      [400, 404, 410].includes(error.response?.status ?? 0)
    );
  }

  private extractStatus(error: unknown): number | undefined {
    if (!axios.isAxiosError(error)) return undefined;
    return error.response?.status;
  }

  private extractResponseData(error: unknown): unknown {
    if (!axios.isAxiosError(error)) return undefined;
    return error.response?.data;
  }
}
