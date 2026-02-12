import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";
import { BcraService, IclIndexData } from "./indices/bcra.service";
import { IpcArService, IpcIndexData } from "./indices/ipc-ar.service";

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  indexType: "icl" | "ipc";
  recordsProcessed: number;
  recordsInserted: number;
  recordsSkipped: number;
  latestPeriod?: Date;
  error?: string;
}

/**
 * Service for synchronizing inflation indices with external APIs.
 * Fetches ICL (BCRA) and IPC (datos.gob.ar) data and stores in database.
 */
export class IndicesSyncService {
  private readonly bcraService: BcraService;
  private readonly ipcArService: IpcArService;

  /**
   * Creates an instance of IndicesSyncService.
   *
   * @param bcraService - Service for BCRA API calls.
   * @param ipcArService - Service for datos.gob.ar IPC API calls.
   */
  constructor(bcraService?: BcraService, ipcArService?: IpcArService) {
    this.bcraService = bcraService || new BcraService();
    this.ipcArService = ipcArService || new IpcArService();
  }

  /**
   * Synchronizes all enabled indices (ICL and IPC).
   *
   * @returns Array of sync results for each index type.
   */
  async syncAll(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    logger.info("Starting full indices synchronization");

    try {
      const iclResult = await this.syncIcl();
      results.push(iclResult);
    } catch (error) {
      results.push({
        indexType: "icl",
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsSkipped: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const ipcResult = await this.syncIpc();
      results.push(ipcResult);
    } catch (error) {
      results.push({
        indexType: "ipc",
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsSkipped: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info("Indices synchronization completed", { results });

    return results;
  }

  /**
   * Synchronizes ICL index from BCRA.
   *
   * @returns Sync result for ICL.
   */
  async syncIcl(): Promise<SyncResult> {
    logger.info("Starting ICL synchronization");

    const result: SyncResult = {
      indexType: "icl",
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsSkipped: 0,
    };

    try {
      // ICL is daily; fetch enough history and persist only the last value for
      // each month.
      const toDate = new Date();
      const fromDate = new Date(2020, 5, 1); // ICL base period starts in 2020

      const iclData = await this.bcraService.getIcl(fromDate, toDate);
      const monthlyIclData = this.keepLatestPerMonth(iclData);
      result.recordsProcessed = monthlyIclData.length;

      for (const data of monthlyIclData) {
        const inserted = await this.upsertIndex(
          "icl",
          data.date,
          data.value,
          "BCRA",
          "https://api.bcra.gob.ar/estadisticas/v3.0/monetarias",
        );
        if (inserted) {
          result.recordsInserted++;
        } else {
          result.recordsSkipped++;
        }
      }

      if (monthlyIclData.length > 0) {
        const sortedData = [...monthlyIclData].sort(
          (a: IclIndexData, b: IclIndexData) =>
            b.date.getTime() - a.date.getTime(),
        );
        result.latestPeriod = sortedData[0].date;
      }

      logger.info("ICL synchronization completed", { result });

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      logger.error("ICL synchronization failed", { error: result.error });
      throw error;
    }
  }

  /**
   * Keeps only the latest daily value for each month.
   */
  private keepLatestPerMonth(data: IclIndexData[]): IclIndexData[] {
    const latestByMonth = new Map<string, IclIndexData>();

    for (const point of data) {
      const monthKey = `${point.date.getUTCFullYear()}-${String(
        point.date.getUTCMonth() + 1,
      ).padStart(2, "0")}`;
      const existing = latestByMonth.get(monthKey);
      if (!existing || point.date.getTime() > existing.date.getTime()) {
        latestByMonth.set(monthKey, point);
      }
    }

    return Array.from(latestByMonth.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }

  /**
   * Synchronizes IPC index from datos.gob.ar.
   *
   * @returns Sync result for IPC.
   */
  async syncIpc(): Promise<SyncResult> {
    logger.info("Starting IPC synchronization");

    const result: SyncResult = {
      indexType: "ipc",
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsSkipped: 0,
    };

    try {
      // IPC is monthly; fetch historical data and upsert by period (month).
      const fromDate = new Date(2016, 0, 1);
      const toDate = new Date();

      const ipcData = await this.ipcArService.getIpc(fromDate, toDate);
      result.recordsProcessed = ipcData.length;

      for (const data of ipcData) {
        const inserted = await this.upsertIndex(
          "ipc",
          data.date,
          data.value,
          "datos.gob.ar",
          "https://apis.datos.gob.ar/series/api/series/",
        );
        if (inserted) {
          result.recordsInserted++;
        } else {
          result.recordsSkipped++;
        }
      }

      if (ipcData.length > 0) {
        const sortedData = [...ipcData].sort(
          (a: IpcIndexData, b: IpcIndexData) =>
            b.date.getTime() - a.date.getTime(),
        );
        result.latestPeriod = sortedData[0].date;
      }

      logger.info("IPC synchronization completed", { result });

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      logger.error("IPC synchronization failed", { error: result.error });
      throw error;
    }
  }

  /**
   * Upserts an index record into the database.
   *
   * @param indexType - Type of index (icl or ipc).
   * @param period - Period date (first day of month).
   * @param value - Index value.
   * @param source - Source name (BCRA or BCB).
   * @param sourceUrl - Source URL.
   * @returns True if a new record was inserted, false if skipped/updated.
   */
  private async upsertIndex(
    indexType: "icl" | "ipc",
    period: Date,
    value: number,
    source: string,
    sourceUrl: string | null = null,
  ): Promise<boolean> {
    // Normalize to first day of month
    const normalizedPeriod = new Date(
      Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1),
    );

    try {
      const result = await AppDataSource.query(
        `INSERT INTO inflation_indices (
                   index_type, period_date, value, source, source_url, published_at
                 )
                 VALUES ($1, $2, $3, $4, $5, $2)
                 ON CONFLICT (index_type, period_date) 
                 DO UPDATE SET value = EXCLUDED.value, 
                               source = EXCLUDED.source,
                               source_url = EXCLUDED.source_url,
                               published_at = EXCLUDED.published_at,
                               updated_at = NOW()
                 RETURNING (xmax = 0) AS inserted`,
        [indexType, normalizedPeriod, value, source, sourceUrl],
      );

      return result[0]?.inserted || false;
    } catch (error) {
      logger.error("Failed to upsert index", {
        indexType,
        period: normalizedPeriod,
        value,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
}
