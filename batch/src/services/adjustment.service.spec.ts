import { AdjustmentService } from "./adjustment.service";

// Mock AppDataSource
jest.mock("../shared/database", () => ({
  AppDataSource: {
    query: jest.fn(),
  },
}));

import { AppDataSource } from "../shared/database";

describe("AdjustmentService", () => {
  let service: AdjustmentService;
  const mockQuery = AppDataSource.query as jest.Mock;

  beforeEach(() => {
    service = new AdjustmentService();
    mockQuery.mockReset();
  });

  describe("calculateAdjustedRent", () => {
    it("should return original amount for none adjustment type", async () => {
      const lease = {
        id: "lease-1",
        rentAmount: 100000,
        adjustmentType: "none" as const,
      };

      const result = await service.calculateAdjustedRent(lease);

      expect(result.originalAmount).toBe(100000);
      expect(result.adjustedAmount).toBe(100000);
      expect(result.adjustmentRate).toBe(0);
    });

    it("should apply fixed adjustment rate when due", async () => {
      const lease = {
        id: "lease-1",
        rentAmount: 100000,
        adjustmentType: "fixed" as const,
        adjustmentRate: 5,
        nextAdjustmentDate: new Date("2024-12-01"),
      };

      const result = await service.calculateAdjustedRent(lease);

      // 5% fixed increase should apply
      expect(result.adjustedAmount).toBe(105000);
    });

    it("should calculate ICL-based adjustment", async () => {
      const lease = {
        id: "lease-1",
        rentAmount: 100000,
        adjustmentType: "icl" as const,
        nextAdjustmentDate: new Date("2024-12-01"),
        lastAdjustmentDate: new Date("2024-10-01"),
      };

      // Current index should be fetched from the previous month to billing.
      mockQuery.mockResolvedValueOnce([
        { value: "1200.00", period_date: "2024-11-01" },
      ]);
      // Mock base index
      mockQuery.mockResolvedValueOnce([
        { value: "1000.00", period_date: "2024-10-01" },
      ]);

      const billingDate = new Date("2024-12-15");
      const result = await service.calculateAdjustedRent(lease, billingDate);

      // 20% increase (1200/1000 = 1.2)
      expect(result.adjustedAmount).toBeCloseTo(120000, 0);
      expect(result.adjustmentRate).toBeCloseTo(20, 0);
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("period_date <= $2"),
        ["icl", new Date("2024-11-01")],
      );
    });

    it("should fallback to an earlier month when previous ICL month is missing", async () => {
      const lease = {
        id: "lease-icl-fallback",
        rentAmount: 150000,
        adjustmentType: "icl" as const,
        lastAdjustmentDate: new Date("2024-08-01"),
      };

      // Billing in Dec-2024 -> target is Nov-2024, fallback to Oct-2024.
      mockQuery.mockResolvedValueOnce([
        { value: "1300.00", period_date: "2024-10-01" },
      ]);
      mockQuery.mockResolvedValueOnce([
        { value: "1000.00", period_date: "2024-08-01" },
      ]);

      const result = await service.calculateAdjustedRent(
        lease,
        new Date("2024-12-20"),
      );

      expect(result.adjustedAmount).toBeCloseTo(195000, 0);
      expect(result.adjustmentRate).toBeCloseTo(30, 2);
    });

    it("should calculate IGP-M based adjustment", async () => {
      const lease = {
        id: "lease-1",
        rentAmount: 50000,
        adjustmentType: "igp_m" as const,
        nextAdjustmentDate: new Date("2024-12-01"),
        lastAdjustmentDate: new Date("2024-06-01"),
      };

      // Mock current index
      mockQuery.mockResolvedValueOnce([
        { value: "550.00", period_date: "2024-12-01" },
      ]);
      // Mock base index
      mockQuery.mockResolvedValueOnce([
        { value: "500.00", period_date: "2024-06-01" },
      ]);

      const result = await service.calculateAdjustedRent(
        lease,
        new Date("2024-12-15"),
      );

      // 10% increase (550/500 = 1.1)
      expect(result.adjustedAmount).toBeCloseTo(55000, 0);

    });

    it("should use billed month IPC and fallback to previous month when missing", async () => {
      const lease = {
        id: "lease-2",
        rentAmount: 100000,
        adjustmentType: "ipc" as const,
        lastAdjustmentDate: new Date("2025-01-01"),
      };

      // Current for billed month fallback (billing 2025-03, found 2025-02)
      mockQuery.mockResolvedValueOnce([
        { value: "150.00", period_date: "2025-02-01" },
      ]);
      // Base (last adjustment 2025-01)
      mockQuery.mockResolvedValueOnce([
        { value: "120.00", period_date: "2025-01-01" },
      ]);

      const result = await service.calculateAdjustedRent(
        lease,
        new Date("2025-03-20"),
      );

      expect(result.adjustedAmount).toBeCloseTo(125000, 0);
      expect(result.adjustmentRate).toBeCloseTo(25, 2);
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("period_date <= $2"),
        ["ipc", new Date("2025-03-01")],
      );
    });

    it("should not adjust when no IPC index exists for billed month or previous", async () => {
      const lease = {
        id: "lease-3",
        rentAmount: 100000,
        adjustmentType: "ipc" as const,
        lastAdjustmentDate: new Date("2025-01-01"),
      };

      mockQuery.mockResolvedValueOnce([]);

      const result = await service.calculateAdjustedRent(
        lease,
        new Date("2025-03-20"),
      );

      expect(result.adjustedAmount).toBe(100000);
      expect(result.adjustmentRate).toBe(0);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe("getLatestIndex", () => {
    it("should return latest ICL index", async () => {
      mockQuery.mockResolvedValueOnce([
        { value: "1234.56", period_date: "2024-12-01" },
      ]);

      const result = await service.getLatestIndex("icl");

      expect(result).toEqual({
        value: 1234.56,
        period: expect.any(Date),
      });
    });

    it("should return null when no index found", async () => {
      mockQuery.mockResolvedValueOnce([]);

      const result = await service.getLatestIndex("igp_m");

      expect(result).toBeNull();
    });
  });
});
