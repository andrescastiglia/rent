import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentStatus, DocumentType } from './entities/document.entity';
import { UserRole } from '../users/entities/user.entity';

describe('DocumentsService', () => {
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  const repository = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => x),
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    find: jest.fn(),
    softDelete: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const config = {
    get: jest.fn((key, fallback) =>
      key === 'FRONTEND_URL' ? 'https://rent.example.com' : fallback,
    ),
    getOrThrow: jest.fn(() => 'test-document-signing-secret'),
  };
  const dataSource = { query: jest.fn() };
  const actor = { id: 'u1', companyId: 'co1', role: UserRole.ADMIN };
  const dto = {
    entityType: 'lease',
    entityId: 'l1',
    documentType: DocumentType.OTHER,
    fileName: 'file.pdf',
    mimeType: 'application/pdf',
    fileSize: 3,
  };
  const pending = {
    id: 'doc-1',
    companyId: 'co1',
    entityType: 'lease',
    entityId: 'l1',
    fileUrl: 'db://document/doc-1',
    fileSize: 3,
    fileMimeType: 'application/pdf',
    status: DocumentStatus.PENDING,
  };
  let service: DocumentsService;
  const tokenFrom = (url: string) => new URL(url).searchParams.get('token')!;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DocumentsService(
      repository as any,
      config as any,
      dataSource as any,
    );
    dataSource.query.mockResolvedValue([{ id: 'l1' }]);
    repository.findOne.mockResolvedValue(pending);
    repository.findOneOrFail.mockResolvedValue({
      ...pending,
      status: DocumentStatus.APPROVED,
    });
    repository.save.mockImplementation(async (x) => x);
    repository.update.mockResolvedValue({ affected: 1 });
    queryBuilder.execute.mockResolvedValue({ affected: 1 });
  });

  it.each([0, -1, 1.5, NaN, 10_485_761])(
    'rejects invalid size %s',
    async (fileSize) => {
      await expect(
        service.generateUploadUrl({ ...dto, fileSize }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
    },
  );
  it('enforces photo size and document MIME limits', async () => {
    await expect(
      service.generateUploadUrl(
        {
          ...dto,
          documentType: DocumentType.PHOTO,
          mimeType: 'image/png',
          fileSize: 5_242_881,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.generateUploadUrl({ ...dto, mimeType: 'text/html' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('creates a pending database record and a scoped API upload URL', async () => {
    const result = await service.generateUploadUrl(dto, actor);
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      'l1',
      'co1',
    ]);
    expect(result.uploadUrl).toContain(
      `https://rent.example.com/api/documents/${result.documentId}/content?token=`,
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.documentId,
        fileUrl: `db://document/${result.documentId}`,
        companyId: 'co1',
        status: DocumentStatus.PENDING,
      }),
    );
    repository.findOne.mockResolvedValue({ ...pending, id: result.documentId });
    await service.uploadContent(
      result.documentId,
      tokenFrom(result.uploadUrl),
      Buffer.from('pdf'),
      'application/pdf',
    );
    expect(repository.update).toHaveBeenCalledWith(
      {
        id: result.documentId,
        companyId: 'co1',
        status: DocumentStatus.PENDING,
      },
      { fileData: Buffer.from('pdf') },
    );
  });
  it('rejects missing, modified, cross-document, wrong-operation and expired tokens', async () => {
    const { uploadUrl, documentId } = await service.generateUploadUrl(
      dto,
      actor,
    );
    const token = tokenFrom(uploadUrl);
    for (const invalid of [
      undefined,
      token + 'x',
      token + '.extra',
      'malformed',
      [token, token] as any,
    ]) {
      await expect(
        service.uploadContent(
          documentId,
          invalid,
          Buffer.from('pdf'),
          'application/pdf',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    await expect(
      service.uploadContent(
        'different-id',
        token,
        Buffer.from('pdf'),
        'application/pdf',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.downloadContent(documentId, token),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 300_001);
    try {
      await expect(
        service.uploadContent(
          documentId,
          token,
          Buffer.from('pdf'),
          'application/pdf',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      now.mockRestore();
    }
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('rechecks ownership when a signed link is used', async () => {
    const { uploadUrl, documentId } = await service.generateUploadUrl(
      dto,
      actor,
    );
    dataSource.query.mockResolvedValue([]);
    await expect(
      service.uploadContent(
        documentId,
        tokenFrom(uploadUrl),
        Buffer.from('pdf'),
        'application/pdf',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('rejects missing pending documents, mismatched size/type and concurrent approval', async () => {
    const { uploadUrl, documentId } = await service.generateUploadUrl(
      dto,
      actor,
    );
    const token = tokenFrom(uploadUrl);
    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.uploadContent(
        documentId,
        token,
        Buffer.from('pdf'),
        'application/pdf',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    for (const [buffer, type] of [
      [Buffer.from('wrong size'), 'application/pdf'],
      [Buffer.from('pdf'), 'image/png'],
      [null, 'application/pdf'],
    ] as const) {
      await expect(
        service.uploadContent(documentId, token, buffer as any, type),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(repository.update).not.toHaveBeenCalled();
    repository.update.mockResolvedValueOnce({ affected: 0 });
    await expect(
      service.uploadContent(
        documentId,
        token,
        Buffer.from('pdf'),
        'application/pdf',
      ),
    ).rejects.toThrow('no longer pending');
  });
  it('confirms only stored bytes with the declared size, atomically', async () => {
    await expect(service.confirmUpload('doc-1', actor)).resolves.toMatchObject({
      status: DocumentStatus.APPROVED,
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'file_data IS NOT NULL AND octet_length(file_data) = file_size',
    );
    expect(queryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DocumentStatus.APPROVED,
        verifiedBy: 'u1',
      }),
    );
  });
  it('rejects confirmation without content and preserves pending content on DB failure', async () => {
    queryBuilder.execute.mockResolvedValueOnce({ affected: 0 });
    await expect(service.confirmUpload('doc-1', actor)).rejects.toThrow(
      'Pending upload content',
    );
    queryBuilder.execute.mockRejectedValueOnce(new Error('db failure'));
    await expect(service.confirmUpload('doc-1', actor)).rejects.toThrow(
      'db failure',
    );
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('handles missing, rejected, already approved and concurrently approved confirmations', async () => {
    repository.findOne.mockResolvedValueOnce(null);
    await expect(service.confirmUpload('doc-1', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    repository.findOne.mockResolvedValueOnce({
      ...pending,
      status: DocumentStatus.REJECTED,
    });
    await expect(service.confirmUpload('doc-1', actor)).rejects.toThrow(
      'not pending',
    );
    repository.findOne.mockResolvedValueOnce({
      ...pending,
      status: DocumentStatus.APPROVED,
    });
    await expect(service.confirmUpload('doc-1', actor)).resolves.toMatchObject({
      status: DocumentStatus.APPROVED,
    });
    expect(queryBuilder.execute).not.toHaveBeenCalled();
    repository.findOne
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ ...pending, status: DocumentStatus.APPROVED });
    queryBuilder.execute.mockResolvedValueOnce({ affected: 0 });
    await expect(service.confirmUpload('doc-1', actor)).resolves.toMatchObject({
      status: DocumentStatus.APPROVED,
    });
  });
  it('returns a signed download URL and reads approved bytes without exposing them in lists', async () => {
    repository.findOne.mockResolvedValue({
      ...pending,
      name: 'file.pdf',
      status: DocumentStatus.APPROVED,
      fileData: Buffer.from('pdf'),
    });
    const { downloadUrl } = await service.generateDownloadUrl('doc-1', actor);
    await expect(
      service.downloadContent('doc-1', tokenFrom(downloadUrl)),
    ).resolves.toEqual({
      buffer: Buffer.from('pdf'),
      contentType: 'application/pdf',
      name: 'file.pdf',
    });
    expect(repository.findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          id: 'doc-1',
          companyId: 'co1',
          status: DocumentStatus.APPROVED,
        },
        select: expect.arrayContaining(['fileData']),
      }),
    );
    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.downloadContent('doc-1', tokenFrom(downloadUrl)),
    ).rejects.toBeInstanceOf(NotFoundException);
    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.generateDownloadUrl('doc-1', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    repository.find.mockResolvedValue([{ id: 'doc-1' }]);
    await expect(service.findByEntity('leases', 'l1', actor)).resolves.toEqual([
      { id: 'doc-1' },
    ]);
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entityType: 'lease',
          entityId: 'l1',
          companyId: 'co1',
          status: DocumentStatus.APPROVED,
        },
      }),
    );
  });
  it('enforces company and parent visibility before any upload record is written', async () => {
    await expect(
      service.generateUploadUrl(dto, { ...actor, companyId: undefined }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.generateUploadUrl({ ...dto, entityType: 'unknown' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    dataSource.query.mockResolvedValue([]);
    await expect(service.generateUploadUrl(dto, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('rejects same-company entities unrelated to the owner', async () => {
    dataSource.query.mockResolvedValue([]);
    await expect(
      service.findByEntity('property', 'p2', {
        ...actor,
        role: UserRole.OWNER,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('o.user_id = $3'),
      ['p2', 'co1', 'u1'],
    );
  });
  it('requires an active rental relationship for tenant access', async () => {
    repository.find.mockResolvedValue([]);
    await service.findByEntity('maintenance_ticket', 't1', {
      ...actor,
      role: UserRole.TENANT,
    });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining("l.status = 'active'"),
      ['t1', 'co1', 'u1'],
    );
  });
  it('soft deletes only visible documents', async () => {
    repository.findOne.mockResolvedValueOnce(null);
    await expect(service.remove('missing', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await service.remove('doc-1', actor);
    expect(repository.softDelete).toHaveBeenCalledWith({
      id: 'doc-1',
      companyId: 'co1',
    });
  });
  it('internal downloads load the binary column explicitly and reject missing data', async () => {
    repository.findOne.mockResolvedValueOnce({
      fileData: Buffer.from('pdf'),
      fileMimeType: 'application/pdf',
    });
    await expect(
      service.downloadByFileUrl('db://document/doc-1'),
    ).resolves.toEqual({
      buffer: Buffer.from('pdf'),
      contentType: 'application/pdf',
    });
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { id: 'doc-1' },
      select: ['id', 'fileData', 'fileMimeType'],
    });
    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.downloadByFileUrl('db://document/missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.downloadByFileUrl('external/file.pdf'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
