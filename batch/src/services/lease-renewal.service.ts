import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";
import { WhatsappService } from "./whatsapp.service";

type RenewalAlertPeriodicity = "monthly" | "four_months" | "custom";

type LeaseRenewalRecord = {
  leaseId: string;
  companyId: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string | null;
  ownerId: string;
  ownerName: string | null;
  ownerPhone: string | null;
  tenantName: string | null;
  endDate: Date;
  renewalAlertPeriodicity: RenewalAlertPeriodicity;
  renewalAlertCustomDays: number | null;
  renewalAlertLastSentAt: Date | null;
};

export type LeaseRenewalAlertResult = {
  recordsTotal: number;
  recordsProcessed: number;
  recordsFailed: number;
  whatsappSent: number;
  errorLog: Array<Record<string, unknown>>;
};

export class LeaseRenewalService {
  constructor(
    private readonly whatsappService: WhatsappService = new WhatsappService(),
  ) {}

  async processDueRenewals(
    referenceDate: Date,
    dryRun: boolean,
  ): Promise<LeaseRenewalAlertResult> {
    const candidates = await this.findCandidateLeases(referenceDate);
    const dueRenewals = candidates.filter((lease) =>
      this.shouldSendAlert(lease, referenceDate),
    );

    const result: LeaseRenewalAlertResult = {
      recordsTotal: dueRenewals.length,
      recordsProcessed: 0,
      recordsFailed: 0,
      whatsappSent: 0,
      errorLog: [],
    };

    for (const lease of dueRenewals) {
      try {
        if (dryRun) {
          logger.info("Dry run: renewal alert would be created", {
            leaseId: lease.leaseId,
            propertyName: lease.propertyName,
            endDate: lease.endDate.toISOString().slice(0, 10),
            leadDays: this.resolveLeadDays(
              lease.renewalAlertPeriodicity,
              lease.renewalAlertCustomDays,
            ),
          });
          result.recordsProcessed += 1;
          continue;
        }

        await this.createOwnerRenewalActivity(lease, referenceDate);
        const whatsappSent = await this.sendOwnerWhatsapp(lease);
        await this.markAlertSent(lease.leaseId, referenceDate);

        result.recordsProcessed += 1;
        if (whatsappSent) {
          result.whatsappSent += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Failed to process lease renewal alert", {
          leaseId: lease.leaseId,
          error: message,
        });
        result.recordsFailed += 1;
        result.errorLog.push({
          leaseId: lease.leaseId,
          propertyName: lease.propertyName,
          error: message,
        });
      }
    }

    return result;
  }

  private async findCandidateLeases(
    referenceDate: Date,
  ): Promise<LeaseRenewalRecord[]> {
    const horizon = new Date(referenceDate);
    horizon.setFullYear(horizon.getFullYear() + 1);

    const rows = await AppDataSource.query(
      `SELECT
          l.id AS lease_id,
          l.company_id,
          l.property_id,
          p.name AS property_name,
          CONCAT_WS(', ', p.address_street, p.address_number, p.address_city, p.address_state) AS property_address,
          l.owner_id,
          CONCAT_WS(' ', ou.first_name, ou.last_name) AS owner_name,
          ou.phone AS owner_phone,
          CONCAT_WS(' ', tu.first_name, tu.last_name) AS tenant_name,
          l.end_date,
          l.renewal_alert_periodicity,
          l.renewal_alert_custom_days,
          l.renewal_alert_last_sent_at
       FROM leases l
       INNER JOIN properties p
         ON p.id = l.property_id
        AND p.deleted_at IS NULL
       INNER JOIN owners o
         ON o.id = l.owner_id
        AND o.deleted_at IS NULL
       INNER JOIN users ou
         ON ou.id = o.user_id
       LEFT JOIN tenants t
         ON t.id = l.tenant_id
       LEFT JOIN users tu
         ON tu.id = t.user_id
       WHERE l.contract_type = 'rental'
         AND l.status = 'active'
         AND l.deleted_at IS NULL
         AND l.renewal_alert_enabled = TRUE
         AND l.end_date IS NOT NULL
         AND l.end_date >= $1::date
         AND l.end_date <= $2::date
       ORDER BY l.end_date ASC`,
      [
        referenceDate.toISOString().slice(0, 10),
        horizon.toISOString().slice(0, 10),
      ],
    );

    return rows.map(
      (row: {
        lease_id: string;
        company_id: string;
        property_id: string;
        property_name: string;
        property_address: string | null;
        owner_id: string;
        owner_name: string | null;
        owner_phone: string | null;
        tenant_name: string | null;
        end_date: string | Date;
        renewal_alert_periodicity: RenewalAlertPeriodicity;
        renewal_alert_custom_days: number | null;
        renewal_alert_last_sent_at: string | Date | null;
      }) => ({
        leaseId: row.lease_id,
        companyId: row.company_id,
        propertyId: row.property_id,
        propertyName: row.property_name,
        propertyAddress: row.property_address,
        ownerId: row.owner_id,
        ownerName: row.owner_name?.trim() || null,
        ownerPhone: row.owner_phone,
        tenantName: row.tenant_name?.trim() || null,
        endDate: new Date(row.end_date),
        renewalAlertPeriodicity: row.renewal_alert_periodicity,
        renewalAlertCustomDays: row.renewal_alert_custom_days,
        renewalAlertLastSentAt: row.renewal_alert_last_sent_at
          ? new Date(row.renewal_alert_last_sent_at)
          : null,
      }),
    );
  }

  private shouldSendAlert(
    lease: LeaseRenewalRecord,
    referenceDate: Date,
  ): boolean {
    const leadDays = this.resolveLeadDays(
      lease.renewalAlertPeriodicity,
      lease.renewalAlertCustomDays,
    );
    const threshold = new Date(lease.endDate);
    threshold.setDate(threshold.getDate() - leadDays);
    threshold.setHours(0, 0, 0, 0);

    const normalizedReferenceDate = new Date(referenceDate);
    normalizedReferenceDate.setHours(0, 0, 0, 0);

    if (normalizedReferenceDate < threshold) {
      return false;
    }

    if (!lease.renewalAlertLastSentAt) {
      return true;
    }

    return lease.renewalAlertLastSentAt < threshold;
  }

  private resolveLeadDays(
    periodicity: RenewalAlertPeriodicity,
    customDays: number | null,
  ): number {
    if (periodicity === "four_months") {
      return 120;
    }

    if (periodicity === "custom") {
      return Math.max(1, customDays ?? 30);
    }

    return 30;
  }

  private async createOwnerRenewalActivity(
    lease: LeaseRenewalRecord,
    referenceDate: Date,
  ): Promise<void> {
    const subject = `Renovar alquiler de ${lease.propertyName}`;
    const body = [
      `El contrato vence el ${lease.endDate.toISOString().slice(0, 10)}.`,
      lease.tenantName ? `Inquilino: ${lease.tenantName}.` : null,
      lease.propertyAddress ? `Propiedad: ${lease.propertyAddress}.` : null,
      "Contactar al propietario para coordinar la renovacion.",
    ]
      .filter(Boolean)
      .join(" ");

    await AppDataSource.query(
      `INSERT INTO owner_activities (
          company_id,
          owner_id,
          property_id,
          type,
          status,
          subject,
          body,
          due_at,
          metadata,
          created_at,
          updated_at
       ) VALUES (
          $1, $2, $3, 'task', 'pending', $4, $5, $6, $7::jsonb, NOW(), NOW()
       )`,
      [
        lease.companyId,
        lease.ownerId,
        lease.propertyId,
        subject,
        body,
        referenceDate,
        JSON.stringify({
          leaseId: lease.leaseId,
          renewalAlert: true,
          endDate: lease.endDate.toISOString().slice(0, 10),
          periodicity: lease.renewalAlertPeriodicity,
        }),
      ],
    );
  }

  private async sendOwnerWhatsapp(lease: LeaseRenewalRecord): Promise<boolean> {
    if (!lease.ownerPhone) {
      return false;
    }

    const text = [
      `Hola ${lease.ownerName || "propietario/a"},`,
      `el contrato de ${lease.propertyName} vence el ${lease.endDate.toISOString().slice(0, 10)}.`,
      lease.tenantName ? `Inquilino: ${lease.tenantName}.` : null,
      "Conviene revisar la renovacion con anticipacion.",
    ]
      .filter(Boolean)
      .join(" ");

    const response = await this.whatsappService.sendTextMessage(
      lease.ownerPhone,
      text,
    );

    return response.success;
  }

  private async markAlertSent(leaseId: string, sentAt: Date): Promise<void> {
    await AppDataSource.query(
      `UPDATE leases
       SET renewal_alert_last_sent_at = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [leaseId, sentAt],
    );
  }
}
