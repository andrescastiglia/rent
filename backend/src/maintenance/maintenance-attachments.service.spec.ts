import { MaintenanceAttachmentsService } from './maintenance-attachments.service';
import { DocumentType } from '../documents/entities/document.entity';
import { UserRole } from '../users/entities/user.entity';

describe('Maintenance attachments', () => {
  const actor = { id: 'tenant', companyId: 'company', role: UserRole.TENANT };
  const dto = {
    fileName: 'repair.png',
    mimeType: 'image/png',
    fileSize: 100,
    documentType: DocumentType.PHOTO,
  };
  const repository = { findOne: jest.fn() };
  const manager = {
    query: jest.fn(),
    getRepository: jest.fn(() => repository),
  };
  const db = { transaction: jest.fn((execute) => execute(manager)) };
  const documents = {
    generateUploadUrl: jest.fn(),
    confirmUpload: jest.fn(),
    renewUploadUrl: jest.fn(),
  };
  let service: MaintenanceAttachmentsService;
  beforeEach(() => {
    jest.clearAllMocks();
    manager.query.mockResolvedValue([{ id: 'ticket' }]);
    service = new MaintenanceAttachmentsService(db as any, documents as any);
  });
  it('binds uploads to the authorized ticket and the same transaction', async () => {
    documents.generateUploadUrl.mockResolvedValue({
      documentId: 'attachment',
      uploadUrl: 'signed',
    });
    documents.renewUploadUrl.mockResolvedValue({
      documentId: 'attachment',
      status: 'pending',
      uploadUrl: 'fresh-signed',
    });
    await expect(service.create('ticket', dto, actor)).resolves.toMatchObject({
      documentId: 'attachment',
    });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      ['ticket', 'company'],
    );
    expect(documents.generateUploadUrl).toHaveBeenCalledWith(
      { ...dto, entityType: 'maintenance_ticket', entityId: 'ticket' },
      actor,
      manager,
    );
  });
  it('rejects a missing company or a foreign ticket before creating documents', async () => {
    await expect(
      service.create('ticket', dto, { ...actor, companyId: '' }),
    ).rejects.toThrow('Company scope');
    manager.query.mockResolvedValue([]);
    await expect(service.create('foreign', dto, actor)).rejects.toThrow(
      'ticket not found',
    );
    expect(documents.generateUploadUrl).not.toHaveBeenCalled();
  });
  it('does not confirm a document from another ticket or company', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(
      service.confirm('ticket', 'foreign-document', actor),
    ).rejects.toThrow('does not belong');
    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        id: 'foreign-document',
        companyId: 'company',
        entityType: 'maintenance_ticket',
        entityId: 'ticket',
      },
    });
    expect(documents.confirmUpload).not.toHaveBeenCalled();
  });
  it('confirms only the ticket attachment within its transaction', async () => {
    repository.findOne.mockResolvedValue({ id: 'attachment' });
    documents.confirmUpload.mockResolvedValue({
      id: 'attachment',
      status: 'approved',
    });
    await expect(
      service.confirm('ticket', 'attachment', actor),
    ).resolves.toMatchObject({ status: 'approved' });
    expect(documents.confirmUpload).toHaveBeenCalledWith(
      'attachment',
      actor,
      manager,
    );
  });
});
