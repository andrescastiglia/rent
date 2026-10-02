import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { InterestedService } from './interested.service';
import { CreateInterestedProfileDto } from './dto/create-interested-profile.dto';
import {
  ApplyInterestedImportDto,
  ApplyInterestedMergeDto,
  ConfigureInterestedPipelineDto,
  PreviewInterestedMergeDto,
} from './dto/assisted-workflow.dto';
import { withDomainOperationReceipt } from '../common/helpers/domain-operation-receipt';
import { signWorkflowReview, verifyWorkflowReview } from './workflow-review';
import { hasRole, isAdminOrStaff } from '../common/helpers/role-scope.helper';
import { UserRole } from '../users/entities/user.entity';

type Actor = {
  id: string;
  companyId: string;
  role: string;
  roles?: UserRole[];
};
type Query = Pick<EntityManager, 'query'>;
type Stage = { id: string; label: string };
const initialStages: Stage[] = [
  { id: 'new', label: 'Nuevo' },
  { id: 'contacted', label: 'Contactado' },
  { id: 'visit', label: 'Visita' },
  { id: 'qualified', label: 'Calificado' },
];
const relatedTables = [
  'interested_activities',
  'interested_stage_history',
  'property_visits',
  'property_reservations',
] as const;

@Injectable()
export class InterestedWorkflowService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly interested: InterestedService,
  ) {}

  private assertActor(actor: Actor): void {
    if (!actor.companyId || !isAdminOrStaff(actor))
      throw new ForbiddenException(
        'CRM management requires a company and staff role',
      );
  }

  async previewImport(rows: CreateInterestedProfileDto[], actor: Actor) {
    this.assertActor(actor);
    const review = await this.importReview(this.db, rows, actor.companyId);
    return {
      ...review,
      reviewToken: signWorkflowReview(actor.companyId, review),
    };
  }

  async applyImport(dto: ApplyInterestedImportDto, actor: Actor, key: string) {
    this.assertActor(actor);
    if (!key) throw new BadRequestException('Idempotency-Key is required');
    return this.db.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId,
        key,
        'crm.import',
        { ...dto, actorId: actor.id },
        async () => {
          const identities = dto.rows.flatMap((row) => [
            `phone:${row.phone.trim()}`,
            ...(row.email ? [`email:${row.email.trim().toLowerCase()}`] : []),
          ]);
          for (const identity of [...new Set(identities)].sort((a, b) =>
            a.localeCompare(b),
          ))
            await manager.query(
              'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
              [`person:${actor.companyId}:${identity}`],
            );
          const review = await this.importReview(
            manager,
            dto.rows,
            actor.companyId,
          );
          verifyWorkflowReview(dto.reviewToken, actor.companyId, review);
          const skipped = new Set(dto.skipRows);
          if (dto.skipRows.some((index) => index >= review.rows.length))
            throw new BadRequestException('Skipped row is outside the import');
          const createdIds: string[] = [];
          for (const row of review.rows) {
            if (skipped.has(row.index)) continue;
            if (
              row.duplicateIds.length ||
              row.duplicateRows.some((index) => !skipped.has(index))
            )
              throw new ConflictException(
                `Revise el duplicado de la fila ${row.index + 1}`,
              );
            const created = await this.interested.withTransaction(manager, () =>
              this.interested.create(row.data, actor),
            );
            createdIds.push(created.id);
          }
          await this.audit(manager, actor, 'import', {
            createdIds,
            skippedRows: [...skipped],
          });
          return { createdIds, skippedRows: [...skipped] };
        },
      ),
    );
  }

  private async importReview(
    query: Query,
    rows: CreateInterestedProfileDto[],
    companyId: string,
  ) {
    const normalized = rows.map((row) => ({
      ...row,
      phone: row.phone.trim(),
      email: row.email?.trim().toLowerCase(),
    }));
    const existing: {
      id: string;
      phone: string;
      email: string | null;
      updatedAt: string;
    }[] = await query.query(
      'SELECT id,phone,email,updated_at::text AS "updatedAt" FROM interested_profiles WHERE company_id=$1 AND deleted_at IS NULL AND (phone=ANY($2::text[]) OR lower(email)=ANY($3::text[])) ORDER BY id',
      [
        companyId,
        normalized.map((row) => row.phone),
        normalized.flatMap((row) => (row.email ? [row.email] : [])),
      ],
    );
    return {
      rows: normalized.map((data, index) => ({
        index,
        data,
        duplicateIds: existing
          .filter(
            (person) =>
              person.phone === data.phone ||
              Boolean(data.email && person.email?.toLowerCase() === data.email),
          )
          .map((person) => person.id),
        duplicateRows: normalized.flatMap((other, otherIndex) =>
          otherIndex !== index &&
          (other.phone === data.phone ||
            Boolean(data.email && other.email === data.email))
            ? [otherIndex]
            : [],
        ),
      })),
      existing,
    };
  }

  async previewMerge(dto: PreviewInterestedMergeDto, actor: Actor) {
    this.assertActor(actor);
    const review = await this.mergeReview(this.db, dto, actor.companyId);
    return {
      ...review,
      impact: [
        'Se conserva el contacto y consentimiento del perfil destino.',
        'Se trasladan actividades, visitas, reservas e historial; el origen queda archivado.',
      ],
      reviewToken: signWorkflowReview(actor.companyId, review),
    };
  }

  async merge(dto: ApplyInterestedMergeDto, actor: Actor, key: string) {
    this.assertActor(actor);
    if (!key) throw new BadRequestException('Idempotency-Key is required');
    return this.db.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId,
        key,
        'crm.merge',
        { ...dto, actorId: actor.id },
        async () => {
          const review = await this.mergeReview(
            manager,
            dto,
            actor.companyId,
            true,
          );
          verifyWorkflowReview(dto.reviewToken, actor.companyId, review);
          const [target, source] = review.people;
          for (const field of [
            'converted_to_tenant_id',
            'converted_to_buyer_id',
            'converted_to_sale_agreement_id',
          ]) {
            if (
              target[field] &&
              source[field] &&
              target[field] !== source[field]
            )
              throw new ConflictException(
                'Los perfiles tienen conversiones distintas. Requieren revisión individual.',
              );
          }
          // Keep colliding matches as archived evidence before transferring the remaining rows.
          await manager.query(
            `UPDATE interested_property_matches s SET deleted_at=now(),updated_at=now() WHERE s.interested_profile_id=$1 AND s.deleted_at IS NULL AND EXISTS (SELECT 1 FROM interested_property_matches t WHERE t.interested_profile_id=$2 AND t.property_id=s.property_id AND t.deleted_at IS NULL)`,
            [dto.sourceId, dto.targetId],
          );
          await manager.query(
            'UPDATE interested_property_matches SET interested_profile_id=$2,updated_at=now() WHERE interested_profile_id=$1 AND deleted_at IS NULL',
            [dto.sourceId, dto.targetId],
          );
          for (const table of relatedTables)
            await manager.query(
              `UPDATE ${table} SET interested_profile_id=$2 WHERE interested_profile_id=$1`,
              [dto.sourceId, dto.targetId],
            );
          await manager.query(
            'UPDATE buyers SET interested_profile_id=$2 WHERE interested_profile_id=$1 AND company_id=$3',
            [dto.sourceId, dto.targetId, actor.companyId],
          );
          await manager.query(
            `UPDATE interested_profiles SET converted_to_tenant_id=NULL,converted_to_buyer_id=NULL,converted_to_sale_agreement_id=NULL,deleted_at=now(),updated_at=now() WHERE id=$1 AND company_id=$2`,
            [dto.sourceId, actor.companyId],
          );
          await manager.query(
            `UPDATE interested_profiles SET converted_to_tenant_id=COALESCE(converted_to_tenant_id,$3::uuid),converted_to_buyer_id=COALESCE(converted_to_buyer_id,$4::uuid),converted_to_sale_agreement_id=COALESCE(converted_to_sale_agreement_id,$5::uuid),updated_at=now() WHERE id=$1 AND company_id=$2`,
            [
              dto.targetId,
              actor.companyId,
              source.converted_to_tenant_id,
              source.converted_to_buyer_id,
              source.converted_to_sale_agreement_id,
            ],
          );
          await this.audit(manager, actor, 'merge', review);
          return { id: dto.targetId, archivedId: dto.sourceId };
        },
      ),
    );
  }

  private async mergeReview(
    query: Query,
    dto: PreviewInterestedMergeDto,
    companyId: string,
    lock = false,
  ) {
    if (dto.targetId === dto.sourceId)
      throw new BadRequestException('Seleccione dos perfiles diferentes');
    const people: Record<string, any>[] = await query.query(
      `SELECT * FROM interested_profiles WHERE id=ANY($1::uuid[]) AND company_id=$2 AND deleted_at IS NULL ORDER BY id ${lock ? 'FOR UPDATE' : ''}`,
      [[dto.targetId, dto.sourceId], companyId],
    );
    if (people.length !== 2)
      throw new NotFoundException('Both profiles must belong to the company');
    people.sort(
      (a, b) => Number(b.id === dto.targetId) - Number(a.id === dto.targetId),
    );
    const related: Record<string, unknown[]> = {};
    for (const table of [...relatedTables, 'interested_property_matches'])
      related[table] = await query.query(
        `SELECT to_jsonb(t) AS record FROM ${table} t WHERE interested_profile_id=ANY($1::uuid[]) ORDER BY id`,
        [[dto.targetId, dto.sourceId]],
      );
    return { people, related };
  }

  async pipeline(actor: Actor, query: Query = this.db): Promise<Stage[]> {
    this.assertActor(actor);
    const [row] = await query.query(
      "SELECT settings->'crmPipeline' AS pipeline FROM companies WHERE id=$1",
      [actor.companyId],
    );
    if (!row) throw new NotFoundException('Company not found');
    return row.pipeline?.stages ?? initialStages;
  }

  async configurePipeline(
    dto: ConfigureInterestedPipelineDto,
    actor: Actor,
    key: string,
  ) {
    this.assertActor(actor);
    if (!hasRole(actor, UserRole.ADMIN))
      throw new ForbiddenException(
        'Only administrators configure the pipeline',
      );
    if (!key) throw new BadRequestException('Idempotency-Key is required');
    return this.db.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId,
        key,
        'crm.pipeline.configure',
        { ...dto, actorId: actor.id },
        async () => {
          await manager.query(
            'SELECT id FROM companies WHERE id=$1 FOR UPDATE',
            [actor.companyId],
          );
          const used = await manager.query(
            'SELECT DISTINCT pipeline_stage AS stage FROM interested_profiles WHERE company_id=$1 AND deleted_at IS NULL AND pipeline_stage IS NOT NULL',
            [actor.companyId],
          );
          if (
            used.some(
              (row: { stage: string }) =>
                !dto.stages.some((stage) => stage.id === row.stage),
            )
          )
            throw new ConflictException('Una etapa en uso no puede eliminarse');
          await manager.query(
            "UPDATE companies SET settings=jsonb_set(COALESCE(settings,'{}'::jsonb),'{crmPipeline}',$2::jsonb),updated_at=now() WHERE id=$1",
            [actor.companyId, JSON.stringify(dto)],
          );
          await this.audit(manager, actor, 'pipeline.configure', dto);
          return dto.stages;
        },
      ),
    );
  }

  async move(id: string, stageId: string, actor: Actor, key: string) {
    this.assertActor(actor);
    if (!key) throw new BadRequestException('Idempotency-Key is required');
    return this.db.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId,
        key,
        'crm.pipeline.move',
        { id, stageId, actorId: actor.id },
        async () => {
          await manager.query(
            'SELECT id FROM companies WHERE id=$1 FOR SHARE',
            [actor.companyId],
          );
          if (
            !(await this.pipeline(actor, manager)).some(
              (stage) => stage.id === stageId,
            )
          )
            throw new BadRequestException('Unknown pipeline stage');
          const [row] = await manager.query(
            'WITH changed AS (UPDATE interested_profiles SET pipeline_stage=$3,updated_at=now() WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL RETURNING id,pipeline_stage) SELECT id,pipeline_stage AS "pipelineStage" FROM changed',
            [id, actor.companyId, stageId],
          );
          if (!row) throw new NotFoundException('Interested profile not found');
          await this.audit(manager, actor, 'pipeline.move', { id, stageId });
          return row;
        },
      ),
    );
  }

  private async audit(
    manager: EntityManager,
    actor: Actor,
    operation: string,
    evidence: unknown,
  ): Promise<void> {
    await manager.query(
      'INSERT INTO interested_workflow_audit(company_id,actor_id,operation,evidence) VALUES($1,$2,$3,$4::jsonb)',
      [actor.companyId, actor.id, operation, JSON.stringify(evidence)],
    );
  }
}
