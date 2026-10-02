import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  DocumentsService,
  DocumentActor,
} from '../documents/documents.service';
import { Document } from '../documents/entities/document.entity';
import { withDomainOperationReceipt } from '../common/helpers/domain-operation-receipt';
import { MaintenanceAttachmentDto } from './dto/maintenance-attachment.dto';

@Injectable()
export class MaintenanceAttachmentsService {
  constructor(
    private readonly db: DataSource,
    private readonly documents: DocumentsService,
  ) {}
  async create(
    ticketId: string,
    dto: MaintenanceAttachmentDto,
    actor: DocumentActor,
    key?: string,
  ) {
    this.requireCompany(actor);
    const result = await this.db.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId!,
        key,
        'maintenance.attachment.create',
        { ticketId, ...dto, actorId: actor.id },
        async () => {
          await this.lockTicket(manager, ticketId, actor.companyId!);
          return this.documents.generateUploadUrl(
            { ...dto, entityType: 'maintenance_ticket', entityId: ticketId },
            actor,
            manager,
          );
        },
      ),
    );
    return this.documents.renewUploadUrl(result.documentId, actor);
  }
  async confirm(
    ticketId: string,
    documentId: string,
    actor: DocumentActor,
    key?: string,
  ) {
    this.requireCompany(actor);
    return this.db.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId!,
        key,
        'maintenance.attachment.confirm',
        { ticketId, documentId, actorId: actor.id },
        async () => {
          await this.lockTicket(manager, ticketId, actor.companyId!);
          const document = await manager.getRepository(Document).findOne({
            where: {
              id: documentId,
              companyId: actor.companyId,
              entityType: 'maintenance_ticket',
              entityId: ticketId,
            },
          });
          if (!document)
            throw new NotFoundException(
              'Attachment does not belong to the ticket',
            );
          return this.documents.confirmUpload(documentId, actor, manager);
        },
      ),
    );
  }
  private requireCompany(actor: DocumentActor): void {
    if (!actor.companyId)
      throw new ForbiddenException('Company scope required');
  }
  private async lockTicket(
    manager: EntityManager,
    ticketId: string,
    companyId: string,
  ): Promise<void> {
    const [ticket] = await manager.query(
      'SELECT id FROM maintenance_tickets WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE',
      [ticketId, companyId],
    );
    if (!ticket) throw new NotFoundException('Maintenance ticket not found');
  }
}
