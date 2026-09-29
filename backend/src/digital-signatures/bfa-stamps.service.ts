import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { BfaClient, BfaProof } from '../integrations/bfa.client';
import { ProviderConfigService } from '../integrations/provider-config.service';

type StampJob = {
  id: string;
  company_id: string;
  document_id: string;
  sha256: string;
  status: 'queued' | 'submitted';
  attempts: number;
  submitted_at: Date | null;
  claim_token: string;
};

@Injectable()
export class BfaStampsService {
  private readonly logger = new Logger(BfaStampsService.name);
  constructor(
    private readonly db: DataSource,
    private readonly bfa: BfaClient,
    private readonly config: ProviderConfigService,
  ) {}

  async request(documentId: string, companyId: string) {
    this.config.assertEnabled('BFA');
    return this.db.transaction(async (manager) => {
      const bytes = await this.document(manager, documentId, companyId);
      const hash = this.bfa.digest(bytes);
      const rows = await manager.query(
        `INSERT INTO document_bfa_stamps(company_id, document_id, sha256) VALUES ($1::uuid, $2::uuid, $3)
         ON CONFLICT (company_id, document_id, sha256) DO UPDATE SET document_id = EXCLUDED.document_id
         RETURNING id, document_id AS "documentId", sha256, status, proof, created_at AS "createdAt"`,
        [companyId, documentId, hash],
      );
      return rows[0];
    });
  }

  async find(documentId: string, companyId: string) {
    if (!companyId) throw new BadRequestException('Company scope required');
    const rows = await this.db.query(
      `SELECT s.id, s.document_id AS "documentId", s.sha256, s.status, s.proof, s.verified_at AS "verifiedAt"
       FROM document_bfa_stamps s JOIN documents d ON d.id = s.document_id AND d.company_id = s.company_id
       WHERE s.company_id = $1::uuid AND s.document_id = $2::uuid AND d.deleted_at IS NULL
       ORDER BY s.created_at DESC LIMIT 1`,
      [companyId, documentId],
    );
    if (!rows[0]) throw new NotFoundException('Document stamp not found');
    return rows[0];
  }

  async processDue() {
    const counts = {
      processed: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0,
      disabled: !this.config.enabled('BFA'),
    };
    if (counts.disabled) return counts;
    for (let index = 0; index < 25; index++) {
      const token = randomUUID();
      const [job]: StampJob[] = await this.db.query(
        `WITH next AS (
          SELECT id FROM document_bfa_stamps WHERE status IN ('queued', 'submitted')
          AND next_attempt_at <= NOW() AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
          ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED
         ), claimed AS (UPDATE document_bfa_stamps s SET claim_token = $1::uuid,
           lease_expires_at = NOW() + INTERVAL '2 minutes', attempts = attempts + 1, updated_at = NOW()
         FROM next WHERE s.id = next.id RETURNING s.*) SELECT * FROM claimed`,
        [token],
      );
      if (!job) break;
      counts.processed++;
      try {
        const bytes = await this.document(
          this.db.manager,
          job.document_id,
          job.company_id,
          false,
        );
        if (this.bfa.digest(bytes) !== job.sha256) {
          await this.finish(job, 'needs_review', 'document_changed');
          counts.failed++;
          continue;
        }
        const proof = await this.bfa.verify(job.sha256);
        if (proof.stamped) {
          await this.complete(job, proof);
          counts.completed++;
        } else {
          await this.submitOrWait(job);
        }
      } catch {
        counts.failed++;
        await this.retry(job, 'provider_unavailable');
        this.logger.warn(
          JSON.stringify({
            event: 'bfa_stamp_failed',
            id: job.id,
            attempt: job.attempts,
          }),
        );
      }
    }
    const [queue] = await this.db.query(
      `SELECT count(*)::integer AS "deadLetter" FROM document_bfa_stamps WHERE status IN ('failed','needs_review')`,
    );
    counts.deadLetter = queue.deadLetter;
    return counts;
  }

  private async submitOrWait(job: StampJob) {
    if (job.status === 'queued') {
      // Commit submission intent first. An interrupted or ambiguous POST is verified,
      // never blindly sent again, even if the response was lost.
      const rows = await this.db.query(
        `WITH submitted AS (UPDATE document_bfa_stamps SET status = 'submitted', submitted_at = NOW(), attempts = 0, updated_at = NOW()
         WHERE id = $1::uuid AND claim_token = $2::uuid RETURNING submitted_at) SELECT * FROM submitted`,
        [job.id, job.claim_token],
      );
      if (!rows[0]) return;
      job.status = 'submitted';
      job.attempts = 0;
      job.submitted_at = rows[0].submitted_at;
      await this.bfa.submit(job.sha256);
    }
    await this.retry(job, null);
  }

  private async retry(job: StampJob, error: string | null) {
    const exhausted =
      job.attempts >= 20 ||
      (job.submitted_at &&
        Date.now() - new Date(job.submitted_at).getTime() >= 3600000);
    if (exhausted)
      return this.finish(
        job,
        job.status === 'submitted' ? 'needs_review' : 'failed',
        error ?? 'confirmation_timeout',
      );
    await this.db.query(
      `UPDATE document_bfa_stamps SET claim_token = NULL, lease_expires_at = NULL,
       next_attempt_at = NOW() + INTERVAL '60 seconds', error_code = $3, updated_at = NOW()
       WHERE id = $1::uuid AND claim_token = $2::uuid`,
      [job.id, job.claim_token, error],
    );
  }

  private async complete(job: StampJob, proof: BfaProof) {
    await this.db.transaction(async (manager) => {
      const bytes = await this.document(
        manager,
        job.document_id,
        job.company_id,
      );
      if (this.bfa.digest(bytes) !== job.sha256)
        throw new Error('Document changed');
      await manager.query(
        `UPDATE document_bfa_stamps SET status = 'stamped', proof = $3::jsonb, verified_at = NOW(),
         claim_token = NULL, lease_expires_at = NULL, error_code = NULL, updated_at = NOW()
         WHERE id = $1::uuid AND claim_token = $2::uuid`,
        [job.id, job.claim_token, JSON.stringify(proof)],
      );
      // A timestamp never transitions a lease to SIGNED or activates a contract.
    });
  }

  private finish(job: StampJob, status: string, error: string) {
    return this.db.query(
      `UPDATE document_bfa_stamps SET status = $3, error_code = $4, claim_token = NULL,
       lease_expires_at = NULL, updated_at = NOW() WHERE id = $1::uuid AND claim_token = $2::uuid`,
      [job.id, job.claim_token, status, error],
    );
  }

  private async document(
    manager: EntityManager,
    id: string,
    companyId: string,
    lock = true,
  ): Promise<Buffer> {
    if (!companyId) throw new BadRequestException('Company scope required');
    const [document] = await manager.query(
      `SELECT file_data, file_mime_type FROM documents WHERE id = $1::uuid AND company_id = $2::uuid
       AND deleted_at IS NULL ${lock ? 'FOR SHARE' : ''}`,
      [id, companyId],
    );
    if (!document) throw new NotFoundException('Document not found');
    if (!document.file_data || document.file_mime_type !== 'application/pdf')
      throw new BadRequestException('A stored PDF is required');
    return document.file_data;
  }
}
