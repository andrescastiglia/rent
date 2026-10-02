import { BatchMetrics } from "./metrics";
it("marks a partial failure as failure even when the caller asks for success", async () => {
  const metrics = new BatchMetrics();
  await metrics.recordJobRun({
    job: "reports",
    status: "success",
    startedAtNs: process.hrtime.bigint(),
    summary: { recordsTotal: 3, recordsProcessed: 2, recordsFailed: 1 },
  });
  const snapshot = await metrics.snapshot();
  expect(snapshot).toContain(
    'batch_job_runs_total{job="reports",status="failed"} 1',
  );
  expect(snapshot).toContain('batch_records_failed_total{job="reports"} 1');
  expect(snapshot).not.toContain(
    'batch_last_success_timestamp_seconds{job="reports"}',
  );
});
it("records actual successes and zero-record jobs without invalid counters", async () => {
  const metrics = new BatchMetrics();
  await metrics.recordJobRun({
    job: "overdue",
    status: "success",
    startedAtNs: process.hrtime.bigint(),
    summary: { recordsTotal: 0, recordsProcessed: 0 },
  });
  const snapshot = await metrics.snapshot();
  expect(snapshot).toContain(
    'batch_job_runs_total{job="overdue",status="success"} 1',
  );
  expect(snapshot).toContain(
    'batch_last_success_timestamp_seconds{job="overdue"}',
  );
});
