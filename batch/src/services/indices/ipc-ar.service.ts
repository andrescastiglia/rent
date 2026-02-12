import axios, { AxiosInstance } from "axios";
import { logger } from "../../shared/logger";

interface DatosArApiResponse {
  data?: Array<[string, number | string]>;
}

export interface IpcIndexData {
  date: Date;
  value: number;
}

/**
 * Service for fetching Argentina IPC series from datos.gob.ar.
 *
 * @see https://apis.datos.gob.ar/series/api/series/
 */
export class IpcArService {
  private readonly apiUrl: string;
  private readonly seriesId: string;
  private readonly client: AxiosInstance;

  /** IPC Nivel General Nacional (Base dic 2016) series id. */
  private static readonly DEFAULT_IPC_SERIES_ID = "148.3_INIVELNAL_DICI_M_26";

  constructor(apiUrl?: string) {
    this.apiUrl =
      apiUrl ||
      process.env.DATOS_AR_API_URL ||
      "https://apis.datos.gob.ar/series/api/series";
    this.seriesId =
      process.env.DATOS_AR_IPC_SERIES_ID || IpcArService.DEFAULT_IPC_SERIES_ID;

    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000,
      headers: {
        Accept: "application/json",
      },
    });
  }

  /**
   * Fetches IPC data points from datos.gob.ar.
   */
  async getIpc(fromDate?: Date, toDate?: Date): Promise<IpcIndexData[]> {
    const params: Record<string, string> = {
      ids: this.seriesId,
    };

    if (fromDate) {
      params.start_date = this.formatDate(fromDate);
    }

    if (toDate) {
      params.end_date = this.formatDate(toDate);
    }

    logger.info("Fetching IPC data from datos.gob.ar", {
      seriesId: this.seriesId,
      params,
    });

    try {
      const response = await this.client.get<DatosArApiResponse>("/", {
        params,
      });

      const rows = response.data.data || [];
      if (rows.length === 0) {
        logger.warn("No IPC data returned from datos.gob.ar", { params });
        return [];
      }

      const parsed: IpcIndexData[] = rows
        .map(([period, value]) => ({
          date: this.parsePeriod(period),
          value: Number(value),
        }))
        .filter((item) => Number.isFinite(item.value));

      logger.info("Successfully fetched IPC data", {
        count: parsed.length,
      });

      return parsed;
    } catch (error) {
      logger.error("Failed to fetch IPC data from datos.gob.ar", {
        error: error instanceof Error ? error.message : error,
        params,
      });
      throw error;
    }
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private parsePeriod(period: string): Date {
    const [year, month, day] = period.split("-").map(Number);
    return new Date(year, month - 1, day || 1);
  }
}
