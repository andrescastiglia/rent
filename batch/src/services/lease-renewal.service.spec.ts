import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";
import { LeaseRenewalService } from "./lease-renewal.service";

jest.mock("../shared/database", () => ({
  AppDataSource: {
    query: jest.fn(),
  },
}));

jest.mock("../shared/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe("LeaseRenewalService", () => {
  const queryMock = AppDataSource.query as jest.Mock;
  const whatsappService = {
    sendTextMessage: jest.fn(),
  };

  let service: LeaseRenewalService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeaseRenewalService(whatsappService as any);
  });

  it("filters due renewals in dry run mode based on periodicity and last sent date", async () => {
    queryMock.mockResolvedValueOnce([
      {
        lease_id: "lease-monthly-due",
        company_id: "company-1",
        property_id: "property-1",
        property_name: "Casa 1",
        property_address: "Calle 1",
        owner_id: "owner-1",
        owner_name: "Owner 1",
        owner_phone: "+5491111111111",
        tenant_name: "Tenant 1",
        end_date: "2026-02-14T00:00:00.000Z",
        renewal_alert_periodicity: "monthly",
        renewal_alert_custom_days: null,
        renewal_alert_last_sent_at: null,
      },
      {
        lease_id: "lease-custom-due",
        company_id: "company-1",
        property_id: "property-2",
        property_name: "Casa 2",
        property_address: "Calle 2",
        owner_id: "owner-2",
        owner_name: "Owner 2",
        owner_phone: "+5491222222222",
        tenant_name: "Tenant 2",
        end_date: "2026-01-20T00:00:00.000Z",
        renewal_alert_periodicity: "custom",
        renewal_alert_custom_days: 10,
        renewal_alert_last_sent_at: "2025-12-01T00:00:00.000Z",
      },
      {
        lease_id: "lease-not-due",
        company_id: "company-1",
        property_id: "property-3",
        property_name: "Casa 3",
        property_address: "Calle 3",
        owner_id: "owner-3",
        owner_name: "Owner 3",
        owner_phone: "+5491333333333",
        tenant_name: "Tenant 3",
        end_date: "2026-05-30T00:00:00.000Z",
        renewal_alert_periodicity: "four_months",
        renewal_alert_custom_days: null,
        renewal_alert_last_sent_at: null,
      },
      {
        lease_id: "lease-already-sent",
        company_id: "company-1",
        property_id: "property-4",
        property_name: "Casa 4",
        property_address: "Calle 4",
        owner_id: "owner-4",
        owner_name: "Owner 4",
        owner_phone: "+5491444444444",
        tenant_name: "Tenant 4",
        end_date: "2026-01-20T00:00:00.000Z",
        renewal_alert_periodicity: "custom",
        renewal_alert_custom_days: 10,
        renewal_alert_last_sent_at: "2026-01-11T00:00:00.000Z",
      },
    ]);

    const result = await service.processDueRenewals(
      new Date("2026-01-15T09:00:00.000Z"),
      true,
    );

    expect(result).toEqual({
      recordsTotal: 2,
      recordsProcessed: 2,
      recordsFailed: 0,
      whatsappSent: 0,
      errorLog: [],
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendTextMessage).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Dry run: renewal alert would be created",
      expect.objectContaining({ leaseId: "lease-monthly-due", leadDays: 30 }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Dry run: renewal alert would be created",
      expect.objectContaining({ leaseId: "lease-custom-due", leadDays: 10 }),
    );
  });

  it("creates owner activity, sends WhatsApp and marks the alert as sent", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          lease_id: "lease-1",
          company_id: "company-1",
          property_id: "property-1",
          property_name: "Casa 1",
          property_address: "Calle 1",
          owner_id: "owner-1",
          owner_name: "Owner 1",
          owner_phone: "+5491111111111",
          tenant_name: "Tenant 1",
          end_date: "2026-02-14T00:00:00.000Z",
          renewal_alert_periodicity: "monthly",
          renewal_alert_custom_days: null,
          renewal_alert_last_sent_at: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    whatsappService.sendTextMessage.mockResolvedValue({
      success: true,
      messageId: "wamid-1",
    });

    const result = await service.processDueRenewals(
      new Date("2026-01-15T09:00:00.000Z"),
      false,
    );

    expect(result).toEqual({
      recordsTotal: 1,
      recordsProcessed: 1,
      recordsFailed: 0,
      whatsappSent: 1,
      errorLog: [],
    });
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO owner_activities"),
      expect.arrayContaining([
        "company-1",
        "owner-1",
        "property-1",
        "Renovar alquiler de Casa 1",
      ]),
    );
    expect(whatsappService.sendTextMessage).toHaveBeenCalledWith(
      "+5491111111111",
      expect.stringContaining("Casa 1 vence el 2026-02-14"),
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("UPDATE leases"),
      expect.arrayContaining(["lease-1"]),
    );
  });

  it("processes renewals without WhatsApp when the owner has no phone", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          lease_id: "lease-2",
          company_id: "company-1",
          property_id: "property-2",
          property_name: "Casa 2",
          property_address: null,
          owner_id: "owner-2",
          owner_name: null,
          owner_phone: null,
          tenant_name: null,
          end_date: "2026-02-14T00:00:00.000Z",
          renewal_alert_periodicity: "monthly",
          renewal_alert_custom_days: null,
          renewal_alert_last_sent_at: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.processDueRenewals(
      new Date("2026-01-15T09:00:00.000Z"),
      false,
    );

    expect(result.recordsProcessed).toBe(1);
    expect(result.whatsappSent).toBe(0);
    expect(whatsappService.sendTextMessage).not.toHaveBeenCalled();
  });

  it("records failures without stopping the remaining batch", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          lease_id: "lease-error",
          company_id: "company-1",
          property_id: "property-9",
          property_name: "Casa Error",
          property_address: "Calle Error",
          owner_id: "owner-9",
          owner_name: "Owner 9",
          owner_phone: "+5491999999999",
          tenant_name: "Tenant 9",
          end_date: "2026-02-14T00:00:00.000Z",
          renewal_alert_periodicity: "monthly",
          renewal_alert_custom_days: null,
          renewal_alert_last_sent_at: null,
        },
      ])
      .mockRejectedValueOnce(new Error("insert failed"));

    const result = await service.processDueRenewals(
      new Date("2026-01-15T09:00:00.000Z"),
      false,
    );

    expect(result.recordsProcessed).toBe(0);
    expect(result.recordsFailed).toBe(1);
    expect(result.errorLog).toEqual([
      {
        leaseId: "lease-error",
        propertyName: "Casa Error",
        error: "insert failed",
      },
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to process lease renewal alert",
      expect.objectContaining({
        leaseId: "lease-error",
        error: "insert failed",
      }),
    );
  });
});
