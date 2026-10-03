import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';

export interface MutationReview {
  entityLabel: string;
  currentState: Record<string, unknown>;
  proposedChange: Record<string, unknown>;
  amount?: string;
  currency?: string;
  impact: string[];
  observedVersion: string;
  expiresAt: string;
}

type Query = Pick<EntityManager, 'query'>;
type ReviewContext = {
  companyId: string;
  executionKey: string;
  tool: string;
  payload: Record<string, unknown>;
  review: MutationReview;
};
const approvedReview = new AsyncLocalStorage<ReviewContext>();

// Table identifiers and labels are application constants; request values remain parameters.
const targets = [
  { pattern: /agenda_task/, table: 'agenda_tasks', label: 'Tarea de agenda' },
  { pattern: /amendment/, table: 'lease_amendments', label: 'Adenda' },
  {
    pattern: /lease_template/,
    table: 'lease_contract_templates',
    label: 'Plantilla de contrato',
    key: 'templateId',
  },
  {
    pattern: /payment_template/,
    table: 'payment_templates',
    label: 'Plantilla de cobro',
  },
  { pattern: /payment/, table: 'payments', label: 'Cobro' },
  { pattern: /invoice/, table: 'invoices', label: 'Factura' },
  {
    pattern: /sales_agreement_receipt/,
    table: 'sale_agreements',
    label: 'Venta',
    key: 'agreementId',
  },
  { pattern: /sales_agreement/, table: 'sale_agreements', label: 'Venta' },
  { pattern: /sales_folder/, table: 'sale_folders', label: 'Carpeta de venta' },
  { pattern: /lease/, table: 'leases', label: 'Contrato' },
  { pattern: /unit/, table: 'units', label: 'Unidad' },
  {
    pattern: /property_visit/,
    table: 'property_visits',
    label: 'Visita',
    key: 'visitId',
  },
  {
    pattern: /maintenance/,
    table: 'maintenance_tickets',
    label: 'Mantenimiento',
  },
  { pattern: /propert/, table: 'properties', label: 'Propiedad' },
  { pattern: /interested/, table: 'interested_profiles', label: 'Interesado' },
  { pattern: /owner/, table: 'owners', label: 'Propietario' },
  // Tenant endpoints identify the person by user UUID, not the tenant profile UUID.
  { pattern: /tenant/, table: 'users', label: 'Inquilino' },
  { pattern: /buyer/, table: 'buyers', label: 'Comprador' },
  { pattern: /user/, table: 'users', label: 'Usuario' },
  { pattern: /document/, table: 'documents', label: 'Documento' },
  { pattern: /bank_account/, table: 'bank_accounts', label: 'Cuenta bancaria' },
];

function reviewTarget(tool: string, payload: Record<string, unknown>) {
  const direct = targets.find((entry) => entry.pattern.test(tool));
  const id = payload[direct?.key ?? 'id'] ?? payload.id;
  if (direct && typeof id === 'string')
    return {
      ...direct,
      id: direct.table === 'agenda_tasks' ? id.replace(/^task:/, '') : id,
    };
  for (const [key, table, label] of [
    ['leaseId', 'leases', 'Contrato'],
    ['propertyId', 'properties', 'Propiedad'],
    ['tenantAccountId', 'tenant_accounts', 'Cuenta del inquilino'],
    ['ownerId', 'owners', 'Propietario'],
    ['folderId', 'sale_folders', 'Carpeta de venta'],
  ]) {
    if (typeof payload[key] === 'string')
      return { table, label, id: payload[key] as string };
  }
  return {
    label: direct?.label ?? 'Operación',
    table: undefined,
    id: undefined,
  };
}

export async function buildMutationReview(
  query: Query,
  companyId: string,
  tool: string,
  payload: Record<string, unknown>,
  expiresAt: string,
  lock = false,
): Promise<MutationReview> {
  if (!companyId) throw new ForbiddenException('Company scope required');
  const target = reviewTarget(tool, payload);
  let currentState: Record<string, unknown> = { state: 'new' };
  if (target.table) {
    const [row] = await query.query(
      `SELECT jsonb_strip_nulls(jsonb_build_object(
        'id', resource.id, 'version', to_jsonb(resource)->'updated_at',
        'status', to_jsonb(resource)->'status', 'name', to_jsonb(resource)->'name',
        'amount', to_jsonb(resource)->'amount', 'total', to_jsonb(resource)->'total',
        'amountPaid', to_jsonb(resource)->'amount_paid', 'rent', to_jsonb(resource)->'monthly_rent',
        'currency', COALESCE(to_jsonb(resource)->'currency_code',to_jsonb(resource)->'currency'), 'deletedAt', to_jsonb(resource)->'deleted_at'
      )) AS state FROM ${target.table} resource
       WHERE resource.id=$1::uuid AND resource.company_id=$2::uuid ${lock ? 'FOR UPDATE' : ''}`,
      [target.id, companyId],
    );
    if (!row)
      throw new NotFoundException(`${target.label} not found in company`);
    currentState = row.state;
  }
  const observedVersion = createHash('sha256')
    .update(JSON.stringify(currentState))
    .digest('hex');
  const financial = /payment|invoice|sales.*receipt|settlement/.test(tool);
  const suffix = target.id ? ` · ${target.id}` : '';
  let currency =
    typeof currentState.currency === 'string'
      ? currentState.currency
      : undefined;
  if (typeof payload.currencyCode === 'string') currency = payload.currencyCode;
  if (typeof payload.currency === 'string') currency = payload.currency;
  const amount =
    payload.amount ??
    payload.monthlyRent ??
    currentState.amount ??
    currentState.total ??
    currentState.rent;
  return {
    entityLabel: `${target.label}${suffix}`,
    currentState,
    proposedChange: JSON.parse(
      JSON.stringify(payload, (key, value) =>
        /password|secret|token|authorization|privatekey/i.test(key)
          ? '[redacted]'
          : value,
      ),
    ),
    amount:
      typeof amount === 'string' || typeof amount === 'number'
        ? String(amount)
        : undefined,
    currency,
    impact: [
      financial
        ? 'Modifica saldos y comprobantes. Los efectos se registran juntos.'
        : 'Modifica el registro y conserva la constancia de la operación.',
      /delete|cancel|reverse/.test(tool)
        ? 'Anula o retira el registro con historial auditable.'
        : 'Se validan permisos y datos vigentes al confirmar.',
    ],
    observedVersion,
    expiresAt,
  };
}

export function withApprovedMutationReview<T>(
  context: ReviewContext,
  execute: () => Promise<T>,
): Promise<T> {
  return approvedReview.run(context, execute);
}

export async function assertApprovedMutationReview(
  manager: EntityManager,
  companyId: string,
  executionKey: string,
): Promise<void> {
  const context = approvedReview.getStore();
  if (!context) return;
  if (
    context.companyId !== companyId ||
    context.executionKey.toLowerCase() !== executionKey.toLowerCase()
  )
    throw new ForbiddenException('Approved operation scope mismatch');
  const expiresAt = Date.parse(context.review.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
    throw new ForbiddenException(
      'La revisión venció. Solicite una nueva propuesta antes de ejecutar.',
    );
  const current = await buildMutationReview(
    manager,
    companyId,
    context.tool,
    context.payload,
    context.review.expiresAt,
    true,
  );
  if (current.observedVersion !== context.review.observedVersion)
    throw new ConflictException(
      'El registro cambió desde la propuesta. Solicite una nueva revisión.',
    );
}
