import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";
import { BcraService, IclIndexData } from "./indices/bcra.service";
import { FgvService, IgpmIndexData } from "./indices/fgv.service";

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  indexType: "icl" | "igpm";
  recordsProcessed: number;
  recordsInserted: number;
  recordsSkipped: number;
  latestPeriod?: Date;
  error?: string;
}

/**
 * Service for synchronizing inflation indices with external APIs.
 * Fetches ICL (BCRA) and IGP-M (BCB) data and stores in database.
 */
export class IndicesSyncService {
  private readonly bcraService: BcraService;
  private readonly fgvService: FgvService;

  /**
   * Creates an instance of IndicesSyncService.
   *
   * @param bcraService - Service for BCRA API calls.
   * @param fgvService - Service for BCB/FGV API calls.
   */
  constructor(bcraService?: BcraService, fgvService?: FgvService) {
    this.bcraService = bcraService || new BcraService();
    this.fgvService = fgvService || new FgvService();
  }

  /**
   * Synchronizes all indices (ICL and IGP-M).
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
      const igpmResult = await this.syncIgpm();
      results.push(igpmResult);
    } catch (error) {
      results.push({
        indexType: "igpm",
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
      // Get date range: last 12 months
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setFullYear(fromDate.getFullYear() - 1);

      const iclData = await this.bcraService.getIcl(fromDate, toDate);
      result.recordsProcessed = iclData.length;

      for (const data of iclData) {
        const inserted = await this.upsertIndex(
          "icl",
          data.date,
          data.value,
          "BCRA",
        );
        if (inserted) {
          result.recordsInserted++;
        } else {
          result.recordsSkipped++;
        }
      }

      if (iclData.length > 0) {
        const sortedData = [...iclData].sort(
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
   * Synchronizes IGP-M index from BCB.
   *
   * @returns Sync result for IGP-M.
   */
  async syncIgpm(): Promise<SyncResult> {
    logger.info("Starting IGP-M synchronization");

    const result: SyncResult = {
      indexType: "igpm",
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsSkipped: 0,
    };

    try {
      // Get date range: last 12 months
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setFullYear(fromDate.getFullYear() - 1);

      const igpmData = await this.fgvService.getIgpm(fromDate, toDate);
      result.recordsProcessed = igpmData.length;

      for (const data of igpmData) {
        const inserted = await this.upsertIndex(
          "igpm",
          data.date,
          data.value,
          "BCB",
        );
        if (inserted) {
          result.recordsInserted++;
        } else {
          result.recordsSkipped++;
        }
      }

      if (igpmData.length > 0) {
        const sortedData = [...igpmData].sort(
          (a: IgpmIndexData, b: IgpmIndexData) =>
            b.date.getTime() - a.date.getTime(),
        );
        result.latestPeriod = sortedData[0].date;
      }

      logger.info("IGP-M synchronization completed", { result });

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      logger.error("IGP-M synchronization failed", { error: result.error });
      throw error;
    }
  }

  /**
   * Upserts an index record into the database.
   *
   * @param indexType - Type of index (icl or igpm).
   * @param period - Period date (first day of month).
   * @param value - Index value.
   * @param source - Source name (BCRA or BCB).
   * @returns True if a new record was inserted, false if skipped/updated.
   */
  private async upsertIndex(
    indexType: "icl" | "igpm",
    period: Date,
    value: number,
    source: string,
  ): Promise<boolean> {
    // Normalize to first day of month
    const normalizedPeriod = new Date(
      period.getFullYear(),
      period.getMonth(),
      1,
    );

    try {
      const result = await AppDataSource.query(
        `INSERT INTO inflation_indices (index_type, period, value, source_name, fetched_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (index_type, period) 
                 DO UPDATE SET value = EXCLUDED.value, 
                               source_name = EXCLUDED.source_name,
                               fetched_at = NOW(),
                               updated_at = NOW()
                 RETURNING (xmax = 0) AS inserted`,
        [indexType, normalizedPeriod, value, source],
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
