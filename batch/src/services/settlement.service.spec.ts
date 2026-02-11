import { SettlementService } from "./settlement.service";

// Mock AppDataSource
jest.mock("../shared/database", () => ({
  AppDataSource: {
    query: jest.fn(),
  },
}));

import { AppDataSource } from "../shared/database";

describe("SettlementService", () => {
  let service: SettlementService;
  const mockQuery = AppDataSource.query as jest.Mock;

  beforeEach(() => {
    service = new SettlementService();
    mockQuery.mockReset();
  });

  describe("calculateSettlement", () => {
    const mockOwnerId = "owner-123";
    const mockPeriod = "2024-12";

    it("should calculate settlement with correct amounts", async () => {
      // Mock owner data
      mockQuery.mockResolvedValueOnce([
        {
          first_name: "John",
          last_name: "Owner",
          commission_rate: "10.00",
        },
      ]);

      // Mock invoices for the period
      mockQuery.mockResolvedValueOnce([
        {
          id: "inv-1",
          invoice_number: "INV-001",
          tenant: "Tenant A",
          property: "Prop 1",
          amount: "100000",
          paid_at: "2024-12-10",
          due_date: "2024-12-15",
        },
        {
          id: "inv-2",
          invoice_number: "INV-002",
          tenant: "Tenant B",
          property: "Prop 2",
          amount: "150000",
          paid_at: "2024-12-12",
          due_date: "2024-12-15",
        },
      ]);

      const result = await service.calculateSettlement(mockOwnerId, mockPeriod);

      expect(result.grossAmount).toBe(250000);
      expect(result.commission.amount).toBe(25000); // 10% of 250000
      expect(result.netAmount).toBe(225000); // 250000 - 25000
      expect(result.ownerId).toBe(mockOwnerId);
      expect(result.ownerName).toBe("John Owner");
    });

    it("should return zero amounts when no invoices", async () => {
      // Mock owner data
      mockQuery.mockResolvedValueOnce([
        {
          first_name: "John",
          last_name: "Owner",
          commission_rate: "10.00",
        },
      ]);

      // Mock empty invoices
      mockQuery.mockResolvedValueOnce([]);

      const result = await service.calculateSettlement(mockOwnerId, mockPeriod);

      expect(result.grossAmount).toBe(0);
      expect(result.commission.amount).toBe(0);
      expect(result.netAmount).toBe(0);
      expect(result.invoices).toHaveLength(0);
    });

    it("should throw error when owner not found", async () => {
      mockQuery.mockResolvedValueOnce([]);

      await expect(
        service.calculateSettlement("non-existent", mockPeriod),
      ).rejects.toThrow("Owner not found");
    });

    it("should use default commission when owner has no rate set", async () => {
      // Mock owner data with null commission
      mockQuery.mockResolvedValueOnce([
        {
          first_name: "John",
          last_name: "Owner",
          commission_rate: null,
        },
      ]);

      // Mock invoices
      mockQuery.mockResolvedValueOnce([
        {
          id: "inv-1",
          invoice_number: "INV-001",
          tenant: "Tenant A",
          property: "Prop 1",
          amount: "100000",
          paid_at: "2024-12-10",
          due_date: "2024-12-15",
        },
      ]);

      const result = await service.calculateSettlement(mockOwnerId, mockPeriod);

      // Should use default commission (5% from env or default)
      expect(result.grossAmount).toBe(100000);
      expect(result.commission.type).toBe("percentage");
    });
  });

  describe("processSettlement", () => {
    const mockOwnerId = "owner-123";
    const mockPeriod = "2024-12";

    it("should process settlement and return success", async () => {
      // Mock owner data
      mockQuery.mockResolvedValueOnce([
        {
          first_name: "John",
          last_name: "Owner",
          commission_rate: "10.00",
        },
      ]);

      // Mock invoices
      mockQuery.mockResolvedValueOnce([
        {
          id: "inv-1",
          invoice_number: "INV-001",
          tenant: "Tenant A",
          property: "Prop 1",
          amount: "100000",
          paid_at: "2024-12-10",
          due_date: "2024-12-15",
        },
      ]);

      // Mock check for existing settlement
      mockQuery.mockResolvedValueOnce([]);

      // Mock insert settlement
      mockQuery.mockResolvedValueOnce([{ id: "settlement-1" }]);

      // Mock update to completed
      mockQuery.mockResolvedValueOnce([]);

      const result = await service.processSettlement(
        mockOwnerId,
        mockPeriod,
        false,
      );

      expect(result.success).toBe(true);
      expect(result.settlementId).toBe("settlement-1");
      expect(result.transferReference).toBeDefined();
    });

    it("should return success without creating record in dry run mode", async () => {
      // Mock owner data
      mockQuery.mockResolvedValueOnce([
        {
          first_name: "John",
          last_name: "Owner",
          commission_rate: "8.50",
        },
      ]);

      // Mock invoices
      mockQuery.mockResolvedValueOnce([
        {
          id: "inv-1",
          invoice_number: "INV-001",
          tenant: "Tenant A",
          property: "Prop 1",
          amount: "200000",
          paid_at: "2024-12-10",
          due_date: "2024-12-15",
        },
      ]);

      const result = await service.processSettlement(
        mockOwnerId,
        mockPeriod,
        true,
      );

      expect(result.success).toBe(true);
      // Should not call insert query (only 2 queries: owner + invoices)
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it("should return success when no invoices to settle", async () => {
      // Mock owner data
      mockQuery.mockResolvedValueOnce([
        {
          first_name: "John",
          last_name: "Owner",
          commission_rate: "10.00",
        },
      ]);

      // Mock empty invoices
      mockQuery.mockResolvedValueOnce([]);

      const result = await service.processSettlement(
        mockOwnerId,
        mockPeriod,
        false,
      );

      expect(result.success).toBe(true);
    });

    it("should skip if settlement already completed", async () => {
      // Mock owner data
      mockQuery.mockResolvedValueOnce([
        {
          first_name: "John",
          last_name: "Owner",
          commission_rate: "10.00",
        },
      ]);

      // Mock invoices
      mockQuery.mockResolvedValueOnce([
        {
          id: "inv-1",
          invoice_number: "INV-001",
          tenant: "Tenant A",
          property: "Prop 1",
          amount: "100000",
          paid_at: "2024-12-10",
          due_date: "2024-12-15",
        },
      ]);

      // Mock existing completed settlement
      mockQuery.mockResolvedValueOnce([
        { id: "settlement-1", status: "completed" },
      ]);

      const result = await service.processSettlement(
        mockOwnerId,
        mockPeriod,
        false,
      );

      expect(result.success).toBe(true);
      expect(result.settlementId).toBe("settlement-1");
    });
  });

  describe("getPendingSettlements", () => {
    it("should return pending settlements ready to process", async () => {
      mockQuery.mockResolvedValueOnce([
        { owner_id: "owner-1", period: "2024-11" },
        { owner_id: "owner-2", period: "2024-11" },
      ]);

      const result = await service.getPendingSettlements();

      expect(result).toHaveLength(2);
      expect(result[0].ownerId).toBe("owner-1");
      expect(result[0].period).toBe("2024-11");
    });

    it("should return empty array when no pending settlements", async () => {
      mockQuery.mockResolvedValueOnce([]);

      const result = await service.getPendingSettlements();

      expect(result).toHaveLength(0);
    });
  });

  describe("getSettlementHistory", () => {
    it("should return settlement history for owner", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          id: "settlement-1",
          owner_id: "owner-1",
          period: "2024-11",
          gross_amount: "100000",
          commission_amount: "10000",
          withholdings_amount: "0",
          net_amount: "90000",
          currency: "ARS",
          status: "completed",
          scheduled_date: "2024-11-15",
          processed_at: "2024-11-15",
          transfer_reference: "TRF-123",
          bank_account_id: null,
          notes: null,
          created_at: "2024-11-01",
          updated_at: "2024-11-15",
        },
        {
          id: "settlement-2",
          owner_id: "owner-1",
          period: "2024-12",
          gross_amount: "150000",
          commission_amount: "15000",
          withholdings_amount: "0",
          net_amount: "135000",
          currency: "ARS",
          status: "pending",
          scheduled_date: "2024-12-15",
          processed_at: null,
          transfer_reference: null,
          bank_account_id: null,
          notes: null,
          created_at: "2024-12-01",
          updated_at: "2024-12-01",
        },
      ]);

      const result = await service.getSettlementHistory("owner-1", 10);

      expect(result).toHaveLength(2);
      expect(result[0].period).toBe("2024-11");
      expect(result[0].status).toBe("completed");
      expect(result[0].netAmount).toBe(90000);
      expect(result[1].period).toBe("2024-12");
      expect(result[1].status).toBe("pending");
    });

    it("should return empty array when no history", async () => {
      mockQuery.mockResolvedValueOnce([]);

      const result = await service.getSettlementHistory("owner-1");

      expect(result).toHaveLength(0);
    });
  });

  describe("T883 - Scheduled Date Logic", () => {
    it("should schedule on due date when payment is early", async () => {
      // Mock owner
      mockQuery.mockResolvedValueOnce([
        { first_name: "John", last_name: "Owner", commission_rate: "10.00" },
      ]);

      // Mock invoice paid before due date
      mockQuery.mockResolvedValueOnce([
        {
          id: "inv-1",
          invoice_number: "INV-001",
          tenant: "Tenant A",
          property: "Prop 1",
          amount: "100000",
          paid_at: "2024-12-10", // Paid early
          due_date: "2024-12-15", // Due later
        },
      ]);

      const result = await service.calculateSettlement("owner-1", "2024-12");

      // Should use due date since payment was early
      expect(result.scheduledDate.toISOString().split("T")[0]).toBe(
        "2024-12-15",
      );
    });

    it("should schedule same day when payment is late", async () => {
      // Mock owner
      mockQuery.mockResolvedValueOnce([
        { first_name: "John", last_name: "Owner", commission_rate: "10.00" },
      ]);

      // Mock invoice paid after due date
      mockQuery.mockResolvedValueOnce([
        {
          id: "inv-1",
          invoice_number: "INV-001",
          tenant: "Tenant A",
          property: "Prop 1",
          amount: "100000",
          paid_at: "2024-12-20", // Paid late
          due_date: "2024-12-15", // Was due earlier
        },
      ]);

      const result = await service.calculateSettlement("owner-1", "2024-12");

      // Should use payment date since payment was late
      expect(result.scheduledDate.toISOString().split("T")[0]).toBe(
        "2024-12-20",
      );
    });

    it("should use latest applicable date from multiple invoices", async () => {
      // Mock owner
      mockQuery.mockResolvedValueOnce([
        { first_name: "John", last_name: "Owner", commission_rate: "10.00" },
      ]);

      // Mock multiple invoices
      mockQuery.mockResolvedValueOnce([
        {
          id: "inv-1",
          invoice_number: "INV-001",
          tenant: "Tenant A",
          property: "Prop 1",
          amount: "100000",
          paid_at: "2024-12-10", // Early payment
          due_date: "2024-12-15", // Scheduled: Dec 15
        },
        {
          id: "inv-2",
          invoice_number: "INV-002",
          tenant: "Tenant B",
          property: "Prop 2",
          amount: "100000",
          paid_at: "2024-12-18", // Late payment
          due_date: "2024-12-12", // Scheduled: Dec 18 (payment date)
        },
      ]);

      const result = await service.calculateSettlement("owner-1", "2024-12");

      // Should use Dec 18 as it's the latest scheduled date
      expect(result.scheduledDate.toISOString().split("T")[0]).toBe(
        "2024-12-18",
      );
    });
  });
});
