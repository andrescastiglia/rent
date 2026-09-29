import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { z } from 'zod';
import { Lease, ContractType, LeaseStatus } from './entities/lease.entity';
import {
  LeaseAmendment,
  AmendmentChangeType,
} from './entities/lease-amendment.entity';
import {
  Property,
  PropertyOperationState,
} from '../properties/entities/property.entity';

export function amendmentDay(value: Date | string): string {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (!z.iso.date().safeParse(text).success)
    throw new BadRequestException('Invalid amendment effective date');
  return text;
}

const amount = z
  .union([z.number(), z.string()])
  .transform(String)
  .refine(
    (value) => /^\d{1,10}(\.\d{1,2})?$/.test(value) && Number(value) > 0,
    'Rent must be positive, with at most two decimal places',
  )
  .transform(Number);
const clauses = z
  .object({ specialClauses: z.string().trim().min(1).max(100000) })
  .strict();

/** Explicit allowlist: never assign arbitrary amendment JSON to a contract. */
export function amendmentValues(
  type: AmendmentChangeType,
  values: Record<string, unknown> = {},
): Record<string, unknown> {
  let schema: z.ZodType;
  switch (type) {
    case AmendmentChangeType.RENT_INCREASE:
    case AmendmentChangeType.RENT_DECREASE:
      schema = z.union([
        z.object({ monthlyRent: amount }).strict(),
        z
          .object({ rentAmount: amount })
          .strict()
          .transform((v) => ({ monthlyRent: v.rentAmount })),
      ]);
      break;
    case AmendmentChangeType.EXTENSION:
      schema = z.object({ endDate: z.iso.date() }).strict();
      break;
    case AmendmentChangeType.EARLY_TERMINATION:
      schema = z.object({}).strict();
      break;
    case AmendmentChangeType.CLAUSE_MODIFICATION:
      schema = z
        .object({
          termsAndConditions: z.string().trim().min(1).max(100000).optional(),
          specialClauses: z.string().trim().min(1).max(100000).optional(),
        })
        .strict()
        .refine((v) => Object.keys(v).length > 0);
      break;
    case AmendmentChangeType.GUARANTOR_CHANGE:
    case AmendmentChangeType.OTHER:
      // These changes are represented by the complete replacement clause text.
      schema = clauses;
      break;
    default:
      throw new BadRequestException('Unsupported amendment change type');
  }
  const parsed = schema.safeParse(values);
  if (!parsed.success)
    throw new BadRequestException(`Invalid newValues for ${type}`);
  return parsed.data as Record<string, unknown>;
}

type AmendmentPatch = Partial<
  Pick<
    Lease,
    | 'monthlyRent'
    | 'lastAdjustmentDate'
    | 'endDate'
    | 'status'
    | 'termsAndConditions'
    | 'specialClauses'
  >
>;

function amendmentPatch(
  lease: Lease,
  amendment: LeaseAmendment,
  date: string,
  values: Record<string, unknown>,
): AmendmentPatch {
  const patch: AmendmentPatch = {};
  const rentChange = [
    AmendmentChangeType.RENT_INCREASE,
    AmendmentChangeType.RENT_DECREASE,
  ].includes(amendment.changeType);
  if (rentChange) {
    return rentAmendmentPatch(lease, amendment, date, values);
  } else if (amendment.changeType === AmendmentChangeType.EXTENSION) {
    if (
      !lease.endDate ||
      String(values.endDate) <= amendmentDay(lease.endDate) ||
      String(values.endDate) < date
    )
      throw new ConflictException(
        'Extension must advance the contract end date',
      );
    patch.endDate = new Date(`${values.endDate}T12:00:00Z`);
  } else if (amendment.changeType === AmendmentChangeType.EARLY_TERMINATION) {
    patch.status = LeaseStatus.FINALIZED;
    patch.endDate = new Date(`${date}T12:00:00Z`);
  } else {
    if (typeof values.termsAndConditions === 'string')
      patch.termsAndConditions = values.termsAndConditions;
    if (typeof values.specialClauses === 'string')
      patch.specialClauses = values.specialClauses;
  }
  return patch;
}

function rentAmendmentPatch(
  lease: Lease,
  amendment: LeaseAmendment,
  date: string,
  values: Record<string, unknown>,
): AmendmentPatch {
  const patch: AmendmentPatch = {};
  if (lease.contractType !== ContractType.RENTAL)
    throw new ConflictException('Rent amendments require a rental contract');
  const current = Number(lease.monthlyRent),
    next = Number(values.monthlyRent);
  if (
    !Number.isFinite(current) ||
    (amendment.changeType === AmendmentChangeType.RENT_INCREASE
      ? next <= current
      : next >= current)
  )
    throw new ConflictException(
      'Rent amendment direction no longer matches the contract',
    );
  if (
    (lease.lastAdjustmentDate &&
      amendmentDay(lease.lastAdjustmentDate) > date) ||
    (lease.nextAdjustmentDate && amendmentDay(lease.nextAdjustmentDate) <= date)
  )
    throw new ConflictException(
      'Review the rent adjustment calendar before applying this amendment',
    );
  patch.monthlyRent = next;
  patch.lastAdjustmentDate = new Date(`${date}T12:00:00Z`);
  return patch;
}

async function applyOne(
  manager: EntityManager,
  lease: Lease,
  amendment: LeaseAmendment,
) {
  if (lease.status !== LeaseStatus.ACTIVE)
    throw new ConflictException('Amendments require an active lease');
  const date = amendmentDay(amendment.effectiveDate);
  if (!lease.startDate || date < amendmentDay(lease.startDate))
    throw new ConflictException('Amendment precedes the contract start');
  if (
    amendment.changeType !== AmendmentChangeType.EXTENSION &&
    lease.endDate &&
    date > amendmentDay(lease.endDate)
  )
    throw new ConflictException('Amendment follows the contract end');
  const [later] = await manager.query(
    `SELECT id FROM lease_amendments WHERE lease_id=$1 AND company_id=$2 AND application_status='applied' AND (effective_date,amendment_number,created_at,id) > ($3::date,$4::integer,$5::timestamptz,$6::uuid) LIMIT 1`,
    [
      lease.id,
      lease.companyId,
      date,
      amendment.amendmentNumber,
      amendment.createdAt,
      amendment.id,
    ],
  );
  if (later)
    throw new ConflictException(
      'A later amendment has already been applied; review this backdated approval',
    );
  const values = amendmentValues(amendment.changeType, amendment.newValues);
  const patch = amendmentPatch(lease, amendment, date, values);
  const rentChange = [
    AmendmentChangeType.RENT_INCREASE,
    AmendmentChangeType.RENT_DECREASE,
  ].includes(amendment.changeType);
  if (
    rentChange ||
    amendment.changeType === AmendmentChangeType.EARLY_TERMINATION
  ) {
    const [billed] = await manager.query(
      `SELECT id FROM invoices WHERE lease_id=$1 AND company_id=$2 AND deleted_at IS NULL AND status NOT IN ('cancelled','refunded') AND period_end >= $3::date LIMIT 1`,
      [lease.id, lease.companyId, date],
    );
    if (billed)
      throw new ConflictException(
        'Existing billing overlaps this amendment; reconcile those invoices first',
      );
  }
  const before = Object.fromEntries(
    Object.keys(patch).map((key) => [key, lease[key as keyof Lease] ?? null]),
  );
  await manager
    .getRepository(Lease)
    .update({ id: lease.id, companyId: lease.companyId }, patch);
  if (
    patch.status === LeaseStatus.FINALIZED &&
    lease.contractType === ContractType.RENTAL &&
    lease.propertyId
  ) {
    await manager
      .getRepository(Property)
      .update(
        { id: lease.propertyId, companyId: lease.companyId },
        { operationState: PropertyOperationState.AVAILABLE },
      );
  }
  await manager.getRepository(LeaseAmendment).update(
    { id: amendment.id, companyId: lease.companyId },
    {
      applicationStatus: 'applied',
      appliedAt: new Date(),
      applicationError: null,
      lastApplicationAttemptAt: new Date(),
      applicationSnapshot: { before, after: patch },
    },
  );
}

/** Caller holds property -> lease locks. Preserve effective-date / amendment-number order. */
export async function applyDueAmendments(
  manager: EntityManager,
  leaseId: string,
  companyId: string,
): Promise<{ applied: number; failed: number }> {
  const rows: Array<{ id: string }> = await manager.query(
    `SELECT id FROM lease_amendments WHERE lease_id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='approved' AND application_status IN ('pending','error') AND effective_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date ORDER BY effective_date,amendment_number,created_at,id FOR NO KEY UPDATE`,
    [leaseId, companyId],
  );
  let applied = 0;
  for (const row of rows) {
    try {
      // A failed SQL write must not poison the outer transaction or leave a partial application.
      await manager.transaction(async (transaction) => {
        const lease = await transaction
          .getRepository(Lease)
          .findOneByOrFail({ id: leaseId, companyId });
        const amendment = await transaction
          .getRepository(LeaseAmendment)
          .findOneByOrFail({ id: row.id, companyId });
        await applyOne(transaction, lease, amendment);
      });
      applied++;
    } catch (error) {
      const message =
        error instanceof BadRequestException ||
        error instanceof ConflictException
          ? error.message
          : 'Amendment application failed; retry or review required';
      await manager.getRepository(LeaseAmendment).update(
        { id: row.id, companyId },
        {
          applicationStatus: 'error',
          applicationError: message,
          lastApplicationAttemptAt: new Date(),
        },
      );
      return { applied, failed: 1 };
    }
  }
  return { applied, failed: 0 };
}

/** Billing must not run ahead of an approved change or use an obsolete contract snapshot. */
export async function assertNoPendingBillingAmendment(
  manager: EntityManager,
  leaseId: string,
  companyId: string,
  periodEnd: Date | string,
): Promise<void> {
  const [pending] = await manager.query(
    `SELECT id FROM lease_amendments WHERE lease_id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='approved' AND application_status IN ('pending','error','legacy_review') AND effective_date <= $3::date AND change_type IN ('rent_increase','rent_decrease','early_termination') LIMIT 1`,
    [leaseId, companyId, periodEnd],
  );
  if (pending)
    throw new ConflictException(
      'An approved amendment must be applied or reviewed before billing this period',
    );
  const [terminated] = await manager.query(
    `SELECT id FROM lease_amendments WHERE lease_id=$1 AND company_id=$2 AND status='approved' AND application_status='applied' AND change_type='early_termination' AND effective_date < $3::date LIMIT 1`,
    [leaseId, companyId, periodEnd],
  );
  if (terminated)
    throw new ConflictException(
      'Billing period extends beyond the applied early termination',
    );
}
