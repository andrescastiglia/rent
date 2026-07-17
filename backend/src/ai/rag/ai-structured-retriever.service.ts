import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { UserRole } from '../../users/entities/user.entity';
import { AiRagContext, AiRagSource } from './ai-rag.types';

type RegistryQuery =
  | 'tenant_balance'
  | 'invoices'
  | 'payments'
  | 'lease_status'
  | 'portfolio'
  | 'availability'
  | 'dashboard';
type StructuredRow = {
  source_id: string;
  entity_type: string;
  entity_id: string;
  label: string;
  updated_at: Date | string;
  payload: Record<string, unknown>;
};

const queryParamsSchema = z.object({
  companyId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  userId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  role: z.nativeEnum(UserRole),
  entityId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .optional(),
  availableOnly: z.boolean(),
  limit: z.number().int().min(1).max(50),
});

@Injectable()
export class AiStructuredRetrieverService {
  constructor(private readonly dataSource: DataSource) {}

  async retrieve(
    prompt: string,
    context: AiRagContext,
  ): Promise<AiRagSource[]> {
    const query = this.selectQuery(prompt);
    if (!this.staffCanRun(query, context)) return [];
    const entityId = prompt.match(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
    )?.[0];
    const params = queryParamsSchema.parse({
      companyId: context.companyId,
      userId: context.userId,
      role: context.role,
      entityId,
      availableOnly: query === 'availability',
      limit: Math.min(Number(process.env.AI_RAG_STRUCTURED_LIMIT ?? 20), 50),
    });
    const rows = await this.execute(query, params);
    if (rows.length === 0) {
      return [this.emptyResultSource(query, context)];
    }
    return rows.map((row) => ({
      sourceId: row.source_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      label: row.label,
      updatedAt: new Date(row.updated_at).toISOString(),
      content: JSON.stringify(row.payload),
      origin: 'structured',
    }));
  }

  private emptyResultSource(
    query: RegistryQuery,
    context: AiRagContext,
  ): AiRagSource {
    const hex = createHash('sha256')
      .update(`${context.companyId}:${context.userId}:${context.role}:${query}`)
      .digest('hex')
      .slice(0, 32);
    const sourceId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
    return {
      sourceId,
      entityType: 'structured_query',
      entityId: context.companyId,
      label: `Resultado ${query}: 0 registros`,
      updatedAt: new Date().toISOString(),
      content: JSON.stringify({ query, resultCount: 0, items: [] }),
      origin: 'structured',
    };
  }

  private selectQuery(prompt: string): RegistryQuery {
    const text = prompt.toLocaleLowerCase('es');
    if (/dashboard|tablero|resumen general|indicadores/.test(text))
      return 'dashboard';
    if (/saldo|cuenta corriente|deuda/.test(text)) return 'tenant_balance';
    if (/pagos?|cobros?/.test(text)) return 'payments';
    if (
      /(?:propiedades?.*(?:venta|precio|importe)|(?:venta|precio).*propiedades?)/.test(
        text,
      )
    ) {
      return 'portfolio';
    }
    if (
      /(?:alquiler|canon).*(?:mensual|monto|importe)|(?:monto|importe).*(?:alquiler|canon)/.test(
        text,
      )
    ) {
      return 'lease_status';
    }
    if (/factur|vencid|monto|importe/.test(text)) return 'invoices';
    if (/contrato|alquiler|lease|vigencia/.test(text)) return 'lease_status';
    if (/disponib|availability/.test(text)) return 'availability';
    return 'portfolio';
  }

  private staffCanRun(query: RegistryQuery, context: AiRagContext): boolean {
    if (context.role !== UserRole.STAFF) return true;
    const permissions = context.permissions;
    if (!permissions || Object.keys(permissions).length === 0) return false;
    if (query === 'invoices') {
      return permissions.invoices === true || permissions.payments === true;
    }
    if (query === 'payments' || query === 'tenant_balance') {
      return (
        permissions.payments === true ||
        permissions.invoices === true ||
        (query === 'tenant_balance' && permissions.tenants === true)
      );
    }
    if (query === 'lease_status') return permissions.leases === true;
    if (query === 'dashboard') {
      return permissions.dashboard === true;
    }
    return permissions.properties === true;
  }

  private async execute(
    query: RegistryQuery,
    params: z.infer<typeof queryParamsSchema>,
  ): Promise<StructuredRow[]> {
    const role = this.roleScope(params.role);
    const values = [
      params.companyId,
      params.userId,
      params.entityId ?? null,
      params.limit,
      params.availableOnly,
    ];

    if (query === 'tenant_balance') {
      return this.dataSource.query<StructuredRow[]>(
        `SELECT a.id AS source_id, 'tenant_account' AS entity_type,
                a.id AS entity_id, 'Cuenta corriente ' || a.id::text AS label,
                a.updated_at,
                jsonb_build_object(
                  'balance', a.current_balance, 'currency', a.currency,
                  'active', a.is_active, 'lastMovementAt', a.last_movement_at,
                  'tenantId', a.tenant_id, 'leaseId', a.lease_id
                ) AS payload
           FROM tenant_accounts a
           JOIN leases l ON l.id = a.lease_id AND l.deleted_at IS NULL
          WHERE a.company_id = $1::uuid AND a.deleted_at IS NULL
            AND $2::uuid IS NOT NULL AND $5::boolean IS NOT NULL
            AND ($3::uuid IS NULL OR a.id = $3::uuid OR a.lease_id = $3::uuid
                 OR a.tenant_id = $3::uuid)
            AND (${role.account})
          ORDER BY a.updated_at DESC LIMIT $4`,
        values,
      );
    }
    if (query === 'invoices') {
      return this.dataSource.query<StructuredRow[]>(
        `SELECT i.id AS source_id, 'invoice' AS entity_type, i.id AS entity_id,
                'Factura ' || i.invoice_number AS label, i.updated_at,
                jsonb_build_object(
                  'invoiceNumber', i.invoice_number, 'status', i.status,
                  'dueDate', i.due_date, 'total', i.total_amount,
                  'paidAmount', i.paid_amount, 'balanceDue', i.balance_due,
                  'currency', i.currency, 'leaseId', i.lease_id
                ) AS payload
           FROM invoices i
           JOIN leases l ON l.id = i.lease_id AND l.deleted_at IS NULL
          WHERE i.company_id = $1::uuid AND i.deleted_at IS NULL
            AND $2::uuid IS NOT NULL
            AND $5::boolean IS NOT NULL
            AND ($3::uuid IS NULL OR i.id = $3::uuid OR i.lease_id = $3::uuid)
            AND (${role.invoice})
            AND (i.balance_due > 0 OR i.status::text NOT IN ('paid', 'cancelled'))
          ORDER BY i.due_date ASC, i.updated_at DESC
          LIMIT $4`,
        values,
      );
    }
    if (query === 'payments') {
      return this.dataSource.query<StructuredRow[]>(
        `SELECT pay.id AS source_id, 'payment' AS entity_type,
                pay.id AS entity_id,
                COALESCE('Pago ' || pay.payment_number, 'Pago ' || pay.id::text) AS label,
                pay.updated_at,
                jsonb_build_object(
                  'paymentNumber', pay.payment_number, 'status', pay.status,
                  'paymentDate', pay.payment_date, 'amount', pay.amount,
                  'currency', pay.currency, 'method', pay.payment_method,
                  'invoiceId', pay.invoice_id, 'tenantId', pay.tenant_id
                ) AS payload
           FROM payments pay
      LEFT JOIN invoices i ON i.id = pay.invoice_id AND i.deleted_at IS NULL
          WHERE pay.company_id = $1::uuid AND pay.deleted_at IS NULL
            AND $2::uuid IS NOT NULL AND $5::boolean IS NOT NULL
            AND ($3::uuid IS NULL OR pay.id = $3::uuid
                 OR pay.invoice_id = $3::uuid OR pay.tenant_id = $3::uuid)
            AND (${role.payment})
          ORDER BY pay.payment_date DESC, pay.updated_at DESC LIMIT $4`,
        values,
      );
    }
    if (query === 'lease_status') {
      return this.dataSource.query<StructuredRow[]>(
        `SELECT l.id AS source_id, 'lease' AS entity_type, l.id AS entity_id,
                COALESCE('Contrato ' || l.lease_number, 'Contrato ' || l.id::text) AS label,
                l.updated_at,
                jsonb_build_object(
                  'leaseNumber', l.lease_number, 'status', l.status,
                  'startDate', l.start_date, 'endDate', l.end_date,
                  'monthlyRent', l.monthly_rent, 'currency', l.currency,
                  'propertyId', l.property_id
                ) AS payload
           FROM leases l
          WHERE l.company_id = $1::uuid AND l.deleted_at IS NULL
            AND $2::uuid IS NOT NULL
            AND $5::boolean IS NOT NULL
            AND ($3::uuid IS NULL OR l.id = $3::uuid OR l.property_id = $3::uuid)
            AND (${role.lease})
          ORDER BY l.updated_at DESC LIMIT $4`,
        values,
      );
    }
    if (query === 'dashboard') {
      return this.dataSource.query<StructuredRow[]>(
        `SELECT $1::uuid AS source_id, 'dashboard' AS entity_type,
                $1::uuid AS entity_id, 'Dashboard actual' AS label, NOW() AS updated_at,
                jsonb_build_object(
                  'properties', (SELECT count(*) FROM properties p
                    WHERE p.company_id = $1::uuid AND p.deleted_at IS NULL
                      AND (${role.property})),
                  'availableProperties', (SELECT count(*) FROM properties p
                    WHERE p.company_id = $1::uuid AND p.deleted_at IS NULL
                      AND p.operation_state::text = 'available' AND (${role.property})),
                  'activeLeases', (SELECT count(*) FROM leases l
                    WHERE l.company_id = $1::uuid AND l.deleted_at IS NULL
                      AND l.status::text = 'active' AND (${role.lease})),
                  'outstandingBalance', (SELECT COALESCE(sum(i.balance_due), 0)
                    FROM invoices i JOIN leases l ON l.id = i.lease_id
                    WHERE i.company_id = $1::uuid AND i.deleted_at IS NULL
                      AND l.deleted_at IS NULL AND i.balance_due > 0
                      AND (${role.invoice})),
                  'currency', 'ARS'
                ) AS payload
          WHERE $2::uuid IS NOT NULL`,
        values.slice(0, 2),
      );
    }
    return this.dataSource.query<StructuredRow[]>(
      `SELECT p.id AS source_id, 'property' AS entity_type, p.id AS entity_id,
              p.name AS label, p.updated_at,
              jsonb_build_object(
                'name', p.name, 'status', p.status,
                'operationState', p.operation_state, 'operations', p.operations,
                'rentPrice', p.rent_price, 'salePrice', p.sale_price,
                'city', p.address_city, 'propertyType', p.property_type
              ) AS payload
         FROM properties p
        WHERE p.company_id = $1::uuid AND p.deleted_at IS NULL
          AND $2::uuid IS NOT NULL
          AND (NOT $5::boolean OR p.operation_state::text = 'available')
          AND ($3::uuid IS NULL OR p.id = $3::uuid)
          AND (${role.property})
        ORDER BY p.updated_at DESC LIMIT $4`,
      values,
    );
  }

  private roleScope(role: UserRole): {
    invoice: string;
    lease: string;
    property: string;
    account: string;
    payment: string;
  } {
    if (role === UserRole.ADMIN || role === UserRole.STAFF) {
      return {
        invoice: 'TRUE',
        lease: 'TRUE',
        property: 'TRUE',
        account: 'TRUE',
        payment: 'TRUE',
      };
    }
    if (role === UserRole.OWNER) {
      return {
        invoice:
          'EXISTS (SELECT 1 FROM owners o WHERE o.id = i.owner_id AND o.user_id = $2::uuid AND o.deleted_at IS NULL)',
        lease:
          'EXISTS (SELECT 1 FROM owners o WHERE o.id = l.owner_id AND o.user_id = $2::uuid AND o.deleted_at IS NULL)',
        property:
          'EXISTS (SELECT 1 FROM owners o WHERE o.id = p.owner_id AND o.user_id = $2::uuid AND o.deleted_at IS NULL)',
        account:
          'EXISTS (SELECT 1 FROM owners o WHERE o.id = l.owner_id AND o.user_id = $2::uuid AND o.deleted_at IS NULL)',
        payment:
          'i.id IS NOT NULL AND EXISTS (SELECT 1 FROM owners o WHERE o.id = i.owner_id AND o.user_id = $2::uuid AND o.deleted_at IS NULL)',
      };
    }
    if (role === UserRole.TENANT) {
      return {
        invoice:
          'EXISTS (SELECT 1 FROM tenants t WHERE t.id = l.tenant_id AND t.user_id = $2::uuid AND t.deleted_at IS NULL)',
        lease:
          'EXISTS (SELECT 1 FROM tenants t WHERE t.id = l.tenant_id AND t.user_id = $2::uuid AND t.deleted_at IS NULL)',
        property:
          'EXISTS (SELECT 1 FROM leases tl JOIN tenants t ON t.id = tl.tenant_id WHERE tl.property_id = p.id AND tl.deleted_at IS NULL AND t.deleted_at IS NULL AND t.user_id = $2::uuid)',
        account:
          'EXISTS (SELECT 1 FROM tenants t WHERE t.id = a.tenant_id AND t.user_id = $2::uuid AND t.deleted_at IS NULL)',
        payment:
          'EXISTS (SELECT 1 FROM tenants t WHERE t.id = pay.tenant_id AND t.user_id = $2::uuid AND t.deleted_at IS NULL)',
      };
    }
    return {
      invoice: 'FALSE',
      lease: 'FALSE',
      property: 'FALSE',
      account: 'FALSE',
      payment: 'FALSE',
    };
  }
}
