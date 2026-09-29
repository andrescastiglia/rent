import { AppDataSource } from "../shared/database";

export type ObservationIndex = "icl" | "ipc" | "igp_m";
export type ObservationSource = { source: string; series: string; url: string };
export type IndexPoint = { date: Date; value: number };

interface StoredObservation {
  date: string;
  value: string;
  revision: number;
  value_kind: string;
  source: string;
  source_series: string;
  source_url: string;
  retrieved_at: Date;
}

/** Append revisions; never overwrite the evidence used by a rent adjustment. */
export class InflationObservationsService {
  async latestDate(index: ObservationIndex): Promise<Date | null> {
    const [row] = await AppDataSource.query(
      "SELECT MAX(observation_date) AS latest FROM inflation_observations WHERE index_type=$1",
      [index],
    );
    return row?.latest ? new Date(row.latest) : null;
  }

  async store(
    index: ObservationIndex,
    points: IndexPoint[],
    source: ObservationSource,
    retrievedAt: Date,
  ) {
    const kind = index === "igp_m" ? "monthly_percent" : "level";
    if (
      !source.source ||
      !source.series ||
      !source.url ||
      !Number.isFinite(retrievedAt.getTime())
    )
      throw new Error("Invalid index provenance");
    const values = new Map<string, string>();
    for (const point of points) {
      if (
        !Number.isFinite(point.date.getTime()) ||
        !Number.isFinite(point.value) ||
        point.value >= 10000000000 ||
        (kind === "level" ? point.value <= 0 : point.value <= -100) ||
        (index !== "icl" && point.date.getUTCDate() !== 1)
      )
        throw new Error("Invalid inflation observation");
      const date = point.date.toISOString().slice(0, 10),
        value = point.value.toFixed(10);
      if (values.has(date) && values.get(date) !== value)
        throw new Error(`Conflicting index observations for ${date}`);
      values.set(date, value);
    }
    if (!values.size) return { inserted: 0, skipped: 0 };
    return AppDataSource.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`inflation-observations:${index}`],
      );
      const existing: StoredObservation[] = await manager.query(
        `SELECT DISTINCT ON (observation_date) observation_date::text AS date,value::text,revision,value_kind,source,source_series,source_url,retrieved_at
         FROM inflation_observations WHERE index_type=$1 AND observation_date=ANY($2::date[])
         ORDER BY observation_date,revision DESC`,
        [index, [...values.keys()]],
      );
      const latest = new Map<string, StoredObservation>(
        existing.map((row) => [row.date, row]),
      );
      let inserted = 0,
        skipped = 0;
      for (const [date, value] of values) {
        const old = latest.get(date);
        if (old && new Date(old.retrieved_at) > retrievedAt) {
          skipped++;
          continue;
        }
        if (
          old &&
          old.value === value &&
          old.value_kind === kind &&
          old.source === source.source &&
          old.source_series === source.series &&
          old.source_url === source.url
        ) {
          skipped++;
          continue;
        }
        await manager.query(
          `INSERT INTO inflation_observations(index_type,observation_date,value,value_kind,source,source_series,source_url,revision,retrieved_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            index,
            date,
            value,
            kind,
            source.source,
            source.series,
            source.url,
            (old?.revision ?? 0) + 1,
            retrievedAt,
          ],
        );
        inserted++;
      }
      return { inserted, skipped };
    });
  }
}
