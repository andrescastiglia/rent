const assert = require("node:assert/strict");
const http = require("node:http");
const { promisify } = require("node:util");
const { execFile } = require("node:child_process");
const path = require("node:path");

async function main() {
  assert.equal(process.env.NODE_ENV, "test", "Requires NODE_ENV=test");
  assert.match(
    new URL(process.env.DATABASE_URL).pathname,
    /test/,
    "Requires a test database",
  );
  require("ts-node/register");
  const { AppDataSource: db } = require("../src/shared/database");
  const {
    InflationObservationsService,
  } = require("../src/services/inflation-observations.service");
  await db.initialize();
  const journal = new InflationObservationsService();
  let revised = false,
    invalid = false,
    ownsDates = false;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("content-type", "application/json");
    if (url.pathname.includes("monetarias/40")) {
      response.end(
        JSON.stringify({
          status: 200,
          metadata: { resultset: { count: 2 } },
          results: [
            {
              idVariable: 40,
              detalle: [
                {
                  fecha: "2098-01-01",
                  valor: invalid ? null : revised ? 1.2 : 1.1,
                },
                { fecha: "2098-01-02", valor: 1.3 },
              ],
            },
          ],
        }),
      );
    } else if (url.pathname.includes("bcdata.sgs.189")) {
      response.end(JSON.stringify([{ data: "01/01/2098", valor: "-0.34" }]));
    } else {
      response.end(JSON.stringify({ data: [["2098-01-01", 100]], count: 1 }));
    }
  });
  try {
    const [existing] = await db.query(
      "SELECT count(*)::int AS count FROM inflation_observations WHERE observation_date BETWEEN '2098-01-01' AND '2098-02-28'",
    );
    assert.equal(existing.count, 0, "Fixture dates must be empty");
    ownsDates = true;
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const run = () =>
      promisify(execFile)(
        process.execPath,
        [
          "-r",
          require.resolve("ts-node/register"),
          "src/index.ts",
          "sync-indices",
          "--from-date",
          "2098-01-01",
          "--to-date",
          "2098-01-31",
        ],
        {
          cwd: path.resolve(__dirname, ".."),
          timeout: 90000,
          maxBuffer: 2 * 1024 * 1024,
          env: {
            ...process.env,
            BCRA_API_URL: base,
            DATOS_AR_API_URL: base,
            BCB_API_URL: base,
            BCRA_ICL_VARIABLE_ID: "40",
            DATOS_AR_IPC_SERIES_ID: "148.3_INIVELNAL_DICI_M_26",
            OTEL_SDK_DISABLED: "true",
          },
        },
      );
    const rows = () =>
      db.query(
        "SELECT index_type,observation_date::text AS date,value::text,value_kind,revision FROM inflation_observations WHERE observation_date BETWEEN '2098-01-01' AND '2098-01-31' ORDER BY index_type,observation_date,revision",
      );
    await run();
    const first = await rows();
    assert.equal(first.length, 4);
    assert.equal(first.filter((row) => row.index_type === "icl").length, 2);
    assert.equal(
      first.find((row) => row.index_type === "igp_m").value,
      "-0.3400000000",
    );
    assert.equal(
      first.find((row) => row.index_type === "igp_m").value_kind,
      "monthly_percent",
    );
    await run();
    assert.deepEqual(
      await rows(),
      first,
      "Repeated ingestion must be idempotent",
    );
    revised = true;
    await run();
    const history = await rows();
    assert.equal(history.length, 5);
    assert.deepEqual(
      history
        .filter((row) => row.index_type === "icl" && row.date === "2098-01-01")
        .map((row) => [row.revision, row.value]),
      [
        [1, "1.1000000000"],
        [2, "1.2000000000"],
      ],
    );
    invalid = true;
    await assert.rejects(run(), (error) => error.code === 1);
    assert.deepEqual(
      await rows(),
      history,
      "A malformed provider response cannot mutate prior evidence",
    );
    const jobs = await db.query(
      "SELECT status,records_failed FROM billing_jobs WHERE job_type='sync_indices' AND parameters->>'fromDate'='2098-01-01' ORDER BY started_at DESC LIMIT 1",
    );
    assert.equal(jobs[0].status, "partial_failure");
    assert.equal(jobs[0].records_failed, 1);
    const source = {
      source: "fixture",
      series: "fixture",
      url: "https://example.test/index",
    };
    const date = new Date("2098-02-01"),
      fetched = new Date();
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () =>
        journal.store("ipc", [{ date, value: 101 }], source, fetched),
      ),
    );
    assert.equal(
      concurrent.reduce((sum, result) => sum + result.inserted, 0),
      1,
    );
    await journal.store(
      "ipc",
      [{ date, value: 102 }],
      source,
      new Date(fetched.getTime() + 1000),
    );
    await journal.store("ipc", [{ date, value: 99 }], source, fetched);
    const revisions = await db.query(
      "SELECT revision,value::text FROM inflation_observations WHERE index_type='ipc' AND observation_date='2098-02-01' ORDER BY revision",
    );
    assert.deepEqual(revisions, [
      { revision: 1, value: "101.0000000000" },
      { revision: 2, value: "102.0000000000" },
    ]);
    await assert.rejects(
      journal.store(
        "ipc",
        [{ date: new Date("2098-02-02"), value: 1 }],
        source,
        fetched,
      ),
      /Invalid inflation/,
    );
    await assert.rejects(
      journal.store(
        "icl",
        [
          { date, value: 1 },
          { date, value: 2 },
        ],
        source,
        fetched,
      ),
      /Conflicting/,
    );
    await assert.rejects(
      db.query(
        "UPDATE inflation_observations SET value=103 WHERE index_type='ipc' AND observation_date='2098-02-01'",
      ),
      /immutable/,
    );
    // Make an insert fail after the first valid insert to prove whole-batch rollback.
    await assert.rejects(
      journal.store(
        "icl",
        [
          { date: new Date("2098-02-01"), value: 1 },
          { date: new Date("2098-02-02"), value: 0.00000000001 },
        ],
        source,
        fetched,
      ),
    );
    const [rolledBack] = await db.query(
      "SELECT count(*)::int AS count FROM inflation_observations WHERE index_type='icl' AND observation_date >= '2098-02-01'",
    );
    assert.equal(rolledBack.count, 0);
    console.log(
      "Index CLI, daily dates, percentages, revisions, retries, stale retrieval, concurrency and rollback verified",
    );
  } finally {
    server.close();
    if (ownsDates) {
      await db.query(
        "DELETE FROM inflation_observations WHERE observation_date BETWEEN '2098-01-01' AND '2098-02-28'",
      );
      await db.query(
        "DELETE FROM billing_jobs WHERE job_type='sync_indices' AND parameters->>'fromDate'='2098-01-01'",
      );
    }
    await db.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
