import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { MercadoLibreClient } from '../integrations/mercadolibre.client';
import { ProviderConfigService } from '../integrations/provider-config.service';
import {
  PortalCandidateDto,
  PortalResolutionDto,
  ResolvePortalPublicationDto,
} from './dto/resolve-portal-publication.dto';

type ReviewJob = {
  id: string;
  operation: string;
  status: string;
  error_code: string | null;
  payload: Record<string, unknown>;
};
type ReviewListing = { id: string; external_id: string | null };

@Injectable()
export class PortalPublicationReviewService {
  constructor(
    private readonly db: DataSource,
    private readonly client: MercadoLibreClient,
    private readonly config: ProviderConfigService,
  ) {}

  async candidate(
    companyId: string,
    listingId: string,
    jobId: string,
    externalId: string,
  ): Promise<PortalCandidateDto> {
    this.config.assertEnabled('MERCADOLIBRE');
    const { job, listing } = await this.context(
      this.db.manager,
      companyId,
      listingId,
      jobId,
    );
    this.assertLinkable(job, listing);
    this.assertItemId(externalId);
    return this.client.get(companyId, externalId);
  }

  async resolve(
    companyId: string,
    userId: string,
    listingId: string,
    jobId: string,
    dto: ResolvePortalPublicationDto,
  ): Promise<PortalResolutionDto> {
    this.config.assertEnabled('MERCADOLIBRE');
    if (
      !userId ||
      !dto.reason?.trim() ||
      dto.reason.trim().length < 10 ||
      dto.reason.trim().length > 1000
    )
      throw new BadRequestException('Actor and review reason required');
    if (
      !['link', 'retry', 'confirm_not_created', 'accept_remote'].includes(
        dto.action,
      )
    )
      throw new BadRequestException('Invalid resolution');
    let remote: PortalCandidateDto | null = null;
    if (dto.action === 'link') {
      // Provider ownership is verified outside the transaction, then the incident is rechecked under lock.
      remote = await this.candidate(
        companyId,
        listingId,
        jobId,
        dto.externalId!,
      );
    }
    if (dto.action === 'accept_remote') {
      const { listing } = await this.context(
        this.db.manager,
        companyId,
        listingId,
        jobId,
      );
      if (!listing.external_id)
        throw new ConflictException('No external item to reconcile');
      remote = await this.client.get(companyId, listing.external_id);
    }
    return this.db.transaction(async (manager) => {
      const { job, listing } = await this.context(
        manager,
        companyId,
        listingId,
        jobId,
        true,
      );
      if (dto.action === 'link' || dto.action === 'confirm_not_created')
        this.assertLinkable(job, listing);
      if (
        dto.action === 'confirm_not_created' &&
        dto.confirmedNoPublication !== true
      )
        throw new BadRequestException(
          'Explicit confirmation of manual provider review required',
        );
      if (
        dto.action === 'retry' &&
        !listing.external_id &&
        !(
          job.operation === 'publish' &&
          job.status === 'failed' &&
          job.error_code === 'provider_rejected'
        )
      )
        throw new ConflictException(
          'An uncertain creation must be reviewed before another publication',
        );
      if (dto.action === 'accept_remote' && listing.external_id !== remote?.id)
        throw new ConflictException('External item changed during review');
      if (remote) {
        const [bound] = await manager.query(
          "SELECT id FROM portal_listings WHERE portal = 'mercadolibre' AND external_id = $1 AND id <> $2::uuid",
          [remote.id, listingId],
        );
        if (bound)
          throw new ConflictException('External item is already linked');
        const localStatus =
          remote.status === 'active'
            ? 'published'
            : remote.status === 'paused'
              ? 'paused'
              : remote.status === 'closed'
                ? 'removed'
                : 'error';
        try {
          await manager.query(
            `UPDATE portal_listings SET external_id = $3, external_url = $4, provider_status = $5::text,
            status = $6::portal_listing_status, published_at = CASE WHEN $5::text = 'active' THEN COALESCE(published_at,now()) ELSE published_at END,
            last_synced_at = now(), error_message = $7, updated_at = now() WHERE id = $1::uuid AND company_id = $2::uuid`,
            [
              listingId,
              companyId,
              remote.id,
              remote.permalink,
              remote.status,
              localStatus,
              localStatus === 'error' ? 'provider_not_active' : null,
            ],
          );
        } catch (error) {
          if ((error as { code?: string }).code === '23505')
            throw new ConflictException('External item is already linked');
          throw error;
        }
      }
      await manager.query(
        "UPDATE portal_publication_outbox SET status = 'resolved', claim_token = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = $1::uuid",
        [jobId],
      );
      let followupJobId: string | null = null;
      // Linking confirms the remote state; only unfinished description work is queued, without reactivating the item.
      if (
        dto.action === 'retry' ||
        (dto.action === 'link' && job.payload.description)
      ) {
        const [followup] = await manager.query(
          `INSERT INTO portal_publication_outbox(company_id,listing_id,operation,payload)
          VALUES($1::uuid,$2::uuid,$3,$4::jsonb) RETURNING id`,
          [
            companyId,
            listingId,
            dto.action === 'link' ? 'refresh' : job.operation,
            JSON.stringify(
              dto.action === 'link'
                ? { description: job.payload.description }
                : job.payload,
            ),
          ],
        );
        followupJobId = followup.id;
      }
      const [result]: PortalResolutionDto[] = await manager.query(
        `INSERT INTO portal_publication_resolutions(company_id,listing_id,job_id,actor_id,action,reason,external_id,provider_snapshot,followup_job_id)
        VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8::jsonb,$9::uuid)
        RETURNING id, job_id AS "jobId", actor_id AS "actorId", action, reason, external_id AS "externalId", followup_job_id AS "followupJobId", created_at AS "createdAt"`,
        [
          companyId,
          listingId,
          jobId,
          userId,
          dto.action,
          dto.reason.trim(),
          remote?.id ?? listing.external_id,
          remote ? JSON.stringify(remote) : null,
          followupJobId,
        ],
      );
      return result;
    });
  }

  async history(
    companyId: string,
    listingId: string,
  ): Promise<PortalResolutionDto[]> {
    await this.listing(this.db.manager, companyId, listingId);
    return this.db.query(
      `SELECT id, job_id AS "jobId", actor_id AS "actorId", action, reason, external_id AS "externalId", followup_job_id AS "followupJobId", created_at AS "createdAt"
      FROM portal_publication_resolutions WHERE company_id = $1::uuid AND listing_id = $2::uuid ORDER BY created_at DESC, id DESC LIMIT 50`,
      [companyId, listingId],
    );
  }

  private async context(
    manager: EntityManager,
    companyId: string,
    listingId: string,
    jobId: string,
    lock = false,
  ) {
    if (!companyId) throw new BadRequestException('Company scope required');
    // Same lock order as the worker: job, then listing.
    const [job]: ReviewJob[] = await manager.query(
      `SELECT * FROM portal_publication_outbox WHERE id = $1::uuid AND company_id = $2::uuid AND listing_id = $3::uuid ${lock ? 'FOR UPDATE' : ''}`,
      [jobId, companyId, listingId],
    );
    if (!job) throw new NotFoundException('Publication operation not found');
    const listing = await this.listing(manager, companyId, listingId, lock);
    if (!['failed', 'needs_review'].includes(job.status))
      throw new ConflictException('Operation does not require review');
    const [latest] = await manager.query(
      'SELECT id FROM portal_publication_outbox WHERE company_id = $1::uuid AND listing_id = $2::uuid ORDER BY created_at DESC, id DESC LIMIT 1',
      [companyId, listingId],
    );
    if (latest?.id !== jobId)
      throw new ConflictException('A newer operation exists');
    return { job, listing };
  }
  private async listing(
    manager: EntityManager,
    companyId: string,
    listingId: string,
    lock = false,
  ): Promise<ReviewListing> {
    if (!companyId) throw new BadRequestException('Company scope required');
    const [listing] = await manager.query(
      `SELECT l.id, l.external_id FROM portal_listings l JOIN properties p ON p.id = l.property_id AND p.company_id = l.company_id
      WHERE l.id = $1::uuid AND l.company_id = $2::uuid AND l.portal = 'mercadolibre' AND p.deleted_at IS NULL ${lock ? 'FOR UPDATE OF l' : ''}`,
      [listingId, companyId],
    );
    if (!listing) throw new NotFoundException('Portal listing not found');
    return listing;
  }
  private assertLinkable(job: ReviewJob, listing: ReviewListing) {
    if (job.operation !== 'publish' || listing.external_id)
      throw new ConflictException(
        'Only unresolved creations can be linked or confirmed absent',
      );
  }
  private assertItemId(id: string) {
    if (typeof id !== 'string' || !/^MLA\d+$/.test(id))
      throw new BadRequestException('Invalid Mercado Libre item ID');
  }
}
