import { logger } from "../shared/logger";
import { BcraService } from "./indices/bcra.service";
import { IpcArService } from "./indices/ipc-ar.service";
import { FgvService } from "./indices/fgv.service";
import { parseIndexPoint } from "./indices/index-point";
import {
  InflationObservationsService,
  IndexPoint,
  ObservationIndex,
  ObservationSource,
} from "./inflation-observations.service";

export interface SyncRange {
  fromDate?: string;
  toDate?: string;
}
export interface SyncResult {
  indexType: ObservationIndex;
  recordsProcessed: number;
  recordsInserted: number;
  recordsSkipped: number;
  latestPeriod?: Date;
  error?: string;
}

const FIRST_DATE: Record<ObservationIndex, string> = {
  icl: "2020-06-30",
  ipc: "2016-12-01",
  igp_m: "1989-06-01",
};
const DAY = 86400000;

/** Stores typed, immutable observations. Legacy monthly rows are not promoted. */
export class IndicesSyncService {
  constructor(
    private readonly bcraService = new BcraService(),
    private readonly ipcArService = new IpcArService(),
    private readonly fgvService = new FgvService(),
    private readonly observations = new InflationObservationsService(),
  ) {}

  async syncAll(range: SyncRange = {}): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const index of ["icl", "ipc", "igp_m"] as const) {
      try {
        results.push(await this.sync(index, range));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Index synchronization failed", { index, error: message });
        results.push({
          indexType: index,
          recordsProcessed: 0,
          recordsInserted: 0,
          recordsSkipped: 0,
          error: message,
        });
      }
    }
    return results;
  }

  syncIcl(range: SyncRange = {}) {
    return this.sync("icl", range);
  }
  syncIpc(range: SyncRange = {}) {
    return this.sync("ipc", range);
  }
  syncIgpm(range: SyncRange = {}) {
    return this.sync("igp_m", range);
  }

  private async sync(
    index: ObservationIndex,
    range: SyncRange,
  ): Promise<SyncResult> {
    // Capture before fetching so a slower, earlier run cannot replace a newer revision.
    const retrievedAt = new Date();
    const to = parseIndexPoint(
      range.toDate ?? retrievedAt.toISOString().slice(0, 10),
      1,
      "level",
    ).date;
    const latest = range.fromDate
      ? null
      : await this.observations.latestDate(index);
    let from = parseIndexPoint(
      range.fromDate ?? FIRST_DATE[index],
      1,
      "level",
    ).date;
    if (!range.fromDate && latest) {
      from = new Date(Math.max(from.getTime(), latest.getTime() - 62 * DAY));
    }
    if (from > to) throw new Error("Index start date must not follow end date");
    // Monthly providers return calendar-month observations; include the starting month.
    if (index !== "icl") from.setUTCDate(1);
    const { fetch, source } = this.provider(index);
    const points: IndexPoint[] = [];
    for (let start = from; start <= to;) {
      // Daily ICL stays far below the BCRA limit. Monthly windows use whole years.
      const next =
        index === "icl"
          ? new Date(start.getTime() + 90 * DAY)
          : new Date(
              Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), 1),
            );
      const end = new Date(Math.min(to.getTime(), next.getTime() - DAY));
      const chunk = await fetch(start, end);
      if (
        chunk.some(
          (point) =>
            !Number.isFinite(point.date.getTime()) ||
            point.date < start ||
            point.date > end,
        )
      ) {
        throw new Error(
          `Provider returned ${index} observations outside the requested range`,
        );
      }
      points.push(...chunk);
      start = next;
    }
    // Persist only after every window succeeds, so a failed fetch cannot leave a gap
    // behind the incremental watermark. The journal also validates every point.
    const stored = await this.observations.store(
      index,
      points,
      source,
      retrievedAt,
    );
    const result: SyncResult = {
      indexType: index,
      recordsProcessed: stored.inserted + stored.skipped,
      recordsInserted: stored.inserted,
      recordsSkipped: stored.skipped,
      latestPeriod: points.length
        ? new Date(Math.max(...points.map((point) => point.date.getTime())))
        : undefined,
    };
    logger.info("Index synchronization completed", result);
    return result;
  }

  private provider(index: ObservationIndex): {
    fetch: (from: Date, to: Date) => Promise<IndexPoint[]>;
    source: ObservationSource;
  } {
    if (index === "icl")
      return {
        fetch: (from, to) => this.bcraService.getIcl(from, to),
        source: this.bcraService.provenance(),
      };
    if (index === "ipc")
      return {
        fetch: (from, to) => this.ipcArService.getIpc(from, to),
        source: this.ipcArService.provenance(),
      };
    return {
      fetch: (from, to) => this.fgvService.getIgpm(from, to),
      source: this.fgvService.provenance(),
    };
  }
}
