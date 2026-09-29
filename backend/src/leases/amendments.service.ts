import {
  AmendmentReviewDto,
  ReviewAmendmentDto,
  ReviewAmendmentResultDto,
} from './dto/review-amendment.dto';
import {
  amendmentDay,
  amendmentValues,
  applyDueAmendments,
} from './amendment-application';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { lockLeaseRows } from './lease-lock';
import { withDomainOperationReceipt } from '../common/helpers/domain-operation-receipt';
import {
  LeaseAmendment,
  AmendmentStatus,
} from './entities/lease-amendment.entity';
import { Lease, LeaseStatus } from './entities/lease.entity';
import { CreateAmendmentDto } from './dto/create-amendment.dto';
import { UserRole } from '../users/entities/user.entity';
import {
  getUserRoles,
  isAdminOrStaff,
} from '../common/helpers/role-scope.helper';

type AmendmentActor = {
  id: string;
  companyId: string;
  role: UserRole;
  roles?: UserRole[];
};

@Injectable()
export class AmendmentsService {
  constructor(
    @InjectRepository(LeaseAmendment)
    private readonly amendmentsRepository: Repository<LeaseAmendment>,
    @InjectRepository(Lease)
    private readonly leasesRepository: Repository<Lease>,
  ) {}

  async create(
    dto: CreateAmendmentDto,
    user: AmendmentActor,
    executionKey?: string,
  ): Promise<LeaseAmendment> {
    this.requireCompany(user);
    const request = { ...dto, companyId: user.companyId };
    return this.amendmentsRepository.manager.transaction(async (manager) => {
      await this.authorizeRecovery(manager, user, dto.leaseId);
      return withDomainOperationReceipt(
        manager,
        user.companyId,
        executionKey,
        'amendment.create',
        request,
        async () => {
          await lockLeaseRows(manager, dto.leaseId, user.companyId);
          const lease = await this.findLeaseScoped(dto.leaseId, user, manager);
          this.requireActive(lease);
          const [{ number }] = await manager.query(
            'SELECT COALESCE(MAX(amendment_number),0)::bigint+1 AS number FROM lease_amendments WHERE lease_id=$1 AND company_id=$2',
            [lease.id, user.companyId],
          );
          const amendmentNumber = Number(number);
          if (
            !Number.isSafeInteger(amendmentNumber) ||
            amendmentNumber < 1 ||
            amendmentNumber > 2147483647
          )
            throw new ConflictException(
              'Amendment numbering capacity exceeded',
            );
          amendmentDay(dto.effectiveDate);
          const values = amendmentValues(dto.changeType, dto.newValues);
          const repository = manager.getRepository(LeaseAmendment);
          return repository.save(
            repository.create({
              ...dto,
              newValues: values,
              companyId: user.companyId,
              requestedBy: user.id,
              status: AmendmentStatus.DRAFT,
              amendmentNumber,
            }),
          );
        },
      );
    });
  }

  async findByLease(
    leaseId: string,
    user: AmendmentActor,
  ): Promise<LeaseAmendment[]> {
    await this.findLeaseScoped(leaseId, user);
    return this.amendmentsRepository.find({
      where: { leaseId, companyId: user.companyId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user: AmendmentActor): Promise<LeaseAmendment> {
    const amendment = await this.amendmentsRepository.findOne({
      where: { id, companyId: user.companyId },
      relations: ['lease'],
    });

    if (!amendment) {
      throw new NotFoundException(`Amendment with ID ${id} not found`);
    }

    await this.findLeaseScoped(amendment.leaseId, user);

    return amendment;
  }

  submit(
    id: string,
    user: AmendmentActor,
    executionKey?: string,
  ): Promise<LeaseAmendment> {
    return this.transition(
      id,
      user,
      AmendmentStatus.PENDING_APPROVAL,
      executionKey,
    );
  }

  approve(
    id: string,
    user: AmendmentActor,
    executionKey?: string,
  ): Promise<LeaseAmendment> {
    return this.transition(id, user, AmendmentStatus.APPROVED, executionKey);
  }

  reject(
    id: string,
    user: AmendmentActor,
    executionKey?: string,
  ): Promise<LeaseAmendment> {
    return this.transition(id, user, AmendmentStatus.REJECTED, executionKey);
  }

  private transition(
    id: string,
    user: AmendmentActor,
    target: AmendmentStatus,
    executionKey?: string,
  ): Promise<LeaseAmendment> {
    this.requireCompany(user);
    return this.amendmentsRepository.manager.transaction(async (manager) => {
      if (!isAdminOrStaff(user)) {
        const historical = await manager.getRepository(LeaseAmendment).findOne({
          where: { id, companyId: user.companyId },
          withDeleted: true,
        });
        if (!historical) throw new NotFoundException('Amendment not found');
        await this.authorizeRecovery(manager, user, historical.leaseId);
      }
      return withDomainOperationReceipt(
        manager,
        user.companyId,
        executionKey,
        `amendment.${target}`,
        { id },
        async () => {
          const repository = manager.getRepository(LeaseAmendment);
          const existing = await repository.findOne({
            where: { id, companyId: user.companyId, deletedAt: IsNull() },
          });
          if (!existing) throw new NotFoundException('Amendment not found');
          await lockLeaseRows(manager, existing.leaseId, user.companyId);
          const lease = await this.findLeaseScoped(
            existing.leaseId,
            user,
            manager,
          );
          const amendment = await repository.findOne({
            where: { id, companyId: user.companyId, deletedAt: IsNull() },
            lock: { mode: 'for_no_key_update' },
          });
          if (!amendment) throw new NotFoundException('Amendment not found');
          if (amendment.leaseId !== lease.id)
            throw new ConflictException(
              'Amendment lease changed; reload before continuing',
            );
          const submitting = target === AmendmentStatus.PENDING_APPROVAL;
          const required = submitting
            ? AmendmentStatus.DRAFT
            : AmendmentStatus.PENDING_APPROVAL;
          if (amendment.status !== required)
            throw new BadRequestException(
              submitting
                ? 'Only draft amendments can be submitted'
                : 'Only pending amendments can be approved or rejected',
            );
          if (target !== AmendmentStatus.REJECTED) this.requireActive(lease);
          if (target !== AmendmentStatus.REJECTED) {
            amendmentDay(amendment.effectiveDate);
            amendmentValues(amendment.changeType, amendment.newValues);
          }
          amendment.status = target;
          if (target === AmendmentStatus.APPROVED)
            amendment.applicationStatus = 'pending';
          if (!submitting) {
            amendment.approvedBy = user.id;
            amendment.approvedAt = new Date();
          }
          const saved = await repository.save(amendment);
          if (target === AmendmentStatus.APPROVED) {
            await applyDueAmendments(manager, lease.id, user.companyId);
            return repository.findOneByOrFail({
              id,
              companyId: user.companyId,
            });
          }
          return saved;
        },
      );
    });
  }

  async review(
    id: string,
    dto: ReviewAmendmentDto,
    user: AmendmentActor,
  ): Promise<ReviewAmendmentResultDto> {
    this.requireReviewer(user);
    const parsed = ReviewAmendmentDto.zodSchema.safeParse(dto);
    if (!parsed.success)
      throw new BadRequestException(
        'Valid review action, reason, observed version and recovery key are required',
      );
    const { idempotencyKey, ...request } = parsed.data;
    return this.amendmentsRepository.manager.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        user.companyId,
        idempotencyKey,
        'amendment.review',
        { id, ...request },
        async () => {
          const repository = manager.getRepository(LeaseAmendment);
          const source = await repository.findOneBy({
            id,
            companyId: user.companyId,
          });
          if (!source) throw new NotFoundException('Amendment not found');
          const cancelling = request.action === 'cancel';
          await lockLeaseRows(
            manager,
            source.leaseId,
            user.companyId,
            undefined,
            cancelling,
          );
          const lease = await this.findLeaseScoped(
            source.leaseId,
            user,
            manager,
            cancelling,
          );
          const amendment = await repository.findOne({
            where: { id, companyId: user.companyId, deletedAt: IsNull() },
            lock: { mode: 'for_no_key_update' },
          });
          if (!amendment || amendment.leaseId !== lease.id)
            throw new ConflictException(
              'Amendment changed; reload before reviewing',
            );
          if (amendment.updatedAt.toISOString() !== request.expectedUpdatedAt)
            throw new ConflictException(
              'Amendment changed; reload before reviewing',
            );
          const before = this.reviewSnapshot(amendment);
          this.prepareReview(amendment, lease, request.action);
          await repository.save(amendment);
          if (request.action === 'schedule')
            await applyDueAmendments(manager, lease.id, user.companyId);
          const result = await repository.findOneByOrFail({
            id,
            companyId: user.companyId,
          });
          const [review] = await manager.query(
            `INSERT INTO lease_amendment_reviews(company_id,amendment_id,action,reason,performed_by,before_snapshot,after_snapshot) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) RETURNING id,amendment_id AS "amendmentId",action,reason,performed_by AS "performedBy",performed_at AS "performedAt",before_snapshot AS "before",after_snapshot AS "after"`,
            [
              user.companyId,
              id,
              request.action,
              request.reason,
              user.id,
              JSON.stringify(before),
              JSON.stringify(this.reviewSnapshot(result)),
            ],
          );
          return { amendment: result, review };
        },
      ),
    );
  }

  async reviewHistory(
    id: string,
    user: AmendmentActor,
  ): Promise<AmendmentReviewDto[]> {
    this.requireReviewer(user);
    const amendment = await this.amendmentsRepository.findOneBy({
      id,
      companyId: user.companyId,
    });
    if (!amendment) throw new NotFoundException('Amendment not found');
    return this.amendmentsRepository.manager.query(
      `SELECT id,amendment_id AS "amendmentId",action,reason,performed_by AS "performedBy",performed_at AS "performedAt",before_snapshot AS "before",after_snapshot AS "after" FROM lease_amendment_reviews WHERE company_id=$1 AND amendment_id=$2 ORDER BY performed_at,id`,
      [user.companyId, id],
    );
  }

  private prepareReview(
    amendment: LeaseAmendment,
    lease: Lease,
    action: 'cancel' | 'schedule',
  ): void {
    if (amendment.applicationStatus === 'applied' || amendment.appliedAt)
      throw new ConflictException(
        'Applied amendments cannot be cancelled or scheduled again',
      );
    if (action === 'cancel') {
      if (
        ![
          AmendmentStatus.DRAFT,
          AmendmentStatus.PENDING_APPROVAL,
          AmendmentStatus.APPROVED,
        ].includes(amendment.status)
      )
        throw new ConflictException(
          'Only open, unapplied amendments can be cancelled',
        );
      amendment.status = AmendmentStatus.CANCELLED;
      amendment.applicationStatus = 'none';
      amendment.applicationError = null;
      return;
    }
    if (
      amendment.status !== AmendmentStatus.APPROVED ||
      amendment.applicationStatus !== 'legacy_review'
    )
      throw new ConflictException(
        'Only historical approvals awaiting review can be scheduled',
      );
    this.requireActive(lease);
    amendmentDay(amendment.effectiveDate);
    amendmentValues(amendment.changeType, amendment.newValues);
    amendment.applicationStatus = 'pending';
    amendment.applicationError = null;
  }

  private reviewSnapshot(amendment: LeaseAmendment): Record<string, unknown> {
    return {
      status: amendment.status,
      applicationStatus: amendment.applicationStatus,
      applicationError: amendment.applicationError,
      effectiveDate: amendment.effectiveDate,
      changeType: amendment.changeType,
      newValues: amendment.newValues,
      appliedAt: amendment.appliedAt,
      applicationSnapshot: amendment.applicationSnapshot,
      approvedBy: amendment.approvedBy,
      approvedAt: amendment.approvedAt,
    };
  }

  private requireReviewer(user: AmendmentActor): void {
    this.requireCompany(user);
    if (!user.id || !isAdminOrStaff(user))
      throw new ForbiddenException('Administrative review is required');
  }

  async processDue(): Promise<{ applied: number; failed: number }> {
    const candidates: Array<{ lease_id: string; company_id: string }> =
      await this.amendmentsRepository.manager.query(
        `SELECT lease_id,company_id FROM lease_amendments WHERE deleted_at IS NULL AND status='approved' AND application_status IN ('pending','error') AND effective_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date GROUP BY lease_id,company_id ORDER BY MIN(last_application_attempt_at) NULLS FIRST,MIN(effective_date),lease_id LIMIT 50`,
      );
    const result = { applied: 0, failed: 0 };
    for (const candidate of candidates) {
      try {
        const counts = await this.amendmentsRepository.manager.transaction(
          async (manager) => {
            await lockLeaseRows(
              manager,
              candidate.lease_id,
              candidate.company_id,
            );
            return applyDueAmendments(
              manager,
              candidate.lease_id,
              candidate.company_id,
            );
          },
        );
        result.applied += counts.applied;
        result.failed += counts.failed;
      } catch {
        result.failed++;
        await this.amendmentsRepository.manager.query(
          `UPDATE lease_amendments SET application_status='error',application_error='Contract unavailable or application failed; review required',last_application_attempt_at=CURRENT_TIMESTAMP WHERE lease_id=$1 AND company_id=$2 AND status='approved' AND application_status IN ('pending','error') AND effective_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`,
          [candidate.lease_id, candidate.company_id],
        );
      }
    }
    return result;
  }

  private requireCompany(user: AmendmentActor): void {
    if (!user.companyId)
      throw new ForbiddenException('Company scope is required');
  }

  private requireActive(lease: Lease): void {
    if (lease.status !== LeaseStatus.ACTIVE)
      throw new BadRequestException('Amendments require an active lease');
  }

  private async authorizeRecovery(
    manager: EntityManager,
    user: AmendmentActor,
    leaseId: string,
  ): Promise<void> {
    // Replayed results must not bypass a former owner's current scope.
    if (!isAdminOrStaff(user))
      await this.findLeaseScoped(leaseId, user, manager, true);
  }

  private async findLeaseScoped(
    leaseId: string,
    user: AmendmentActor,
    manager?: EntityManager,
    withDeleted = false,
  ): Promise<Lease> {
    this.requireCompany(user);
    const query = (manager?.getRepository(Lease) ?? this.leasesRepository)
      .createQueryBuilder('lease')
      .leftJoin('lease.property', 'property')
      .leftJoin('property.owner', 'owner')
      .leftJoin('lease.tenant', 'tenant')
      .leftJoin('lease.buyer', 'buyer')
      .where('lease.id = :leaseId', { leaseId })
      .andWhere('lease.company_id = :companyId', { companyId: user.companyId });
    if (withDeleted) query.withDeleted();
    else query.andWhere('lease.deleted_at IS NULL');

    if (!isAdminOrStaff(user)) {
      const roles = getUserRoles(user);
      const scopes = [
        roles.includes(UserRole.OWNER) ? 'owner.user_id = :userId' : null,
        roles.includes(UserRole.TENANT) ? 'tenant.user_id = :userId' : null,
        roles.includes(UserRole.BUYER) ? 'buyer.user_id = :userId' : null,
      ].filter((scope): scope is string => Boolean(scope));
      query.andWhere(scopes.length ? `(${scopes.join(' OR ')})` : 'FALSE', {
        userId: user.id,
      });
    }

    const lease = await query.getOne();
    if (!lease) {
      throw new NotFoundException(`Lease with ID ${leaseId} not found`);
    }
    return lease;
  }
}
