import { BillingJobService } from "./billing-job.service";
import { AppDataSource } from "../shared/database";
jest.mock("../shared/database", () => ({
  AppDataSource: { query: jest.fn() },
}));
jest.mock("../shared/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));
const query = AppDataSource.query as jest.Mock;
let exitCode: string | number | null | undefined;
beforeEach(() => {
  query.mockReset();
  exitCode = process.exitCode;
  process.exitCode = undefined;
});
afterEach(() => {
  process.exitCode = exitCode;
});
it("starts a job with its parameters and dry-run state", async () => {
  query.mockResolvedValue([{ id: "job-id" }]);
  expect(
    await new BillingJobService().startJob("reports", { ownerId: "o1" }, true),
  ).toBe("job-id");
  expect(query.mock.calls[0][1]).toEqual(["reports", '{"ownerId":"o1"}', true]);
});
it("a partial failure is persisted and produces a failing process exit code", async () => {
  query.mockResolvedValue([]);
  await new BillingJobService().completeJob("j1", {
    recordsTotal: 3,
    recordsProcessed: 2,
    recordsFailed: 1,
    errorLog: [{ id: "failure" }],
  });
  expect(query.mock.calls[0][1]).toEqual([
    "j1",
    "partial_failure",
    3,
    2,
    1,
    0,
    '[{"id":"failure"}]',
  ]);
  expect(process.exitCode).toBe(1);
});
it("successful completion cannot reset a prior failure exit code", async () => {
  process.exitCode = 1;
  query.mockResolvedValue([]);
  await new BillingJobService().completeJob("j1", { recordsProcessed: 2 });
  expect(query.mock.calls[0][1][1]).toBe("completed");
  expect(process.exitCode).toBe(1);
});
it("persists whole-job failure details", async () => {
  query.mockResolvedValue([]);
  await new BillingJobService().failJob("j1", "connection lost", [
    { leaseId: "l1" },
  ]);
  expect(query.mock.calls[0][1]).toEqual([
    "j1",
    "connection lost",
    '[{"leaseId":"l1"}]',
  ]);
});
it.each(["startJob", "completeJob", "failJob"] as const)(
  "propagates storage errors from %s",
  async (method) => {
    query.mockRejectedValue(new Error("db unavailable"));
    const service = new BillingJobService();
    const result =
      method === "startJob"
        ? service.startJob("reports")
        : method === "completeJob"
          ? service.completeJob("j1", {})
          : service.failJob("j1", "failure");
    await expect(result).rejects.toThrow("db unavailable");
  },
);
