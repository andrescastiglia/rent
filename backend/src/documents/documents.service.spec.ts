import { Readable } from 'stream';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentStatus, DocumentType } from './entities/document.entity';
import { getS3Config } from '../config/s3.config';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { UserRole } from '../users/entities/user.entity';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async () => 'https://signed.url'),
}));

jest.mock('../config/s3.config', () => ({
  S3_BUCKET_NAME: 'bucket-test',
  getS3Config: jest.fn(),
}));

const mockedGetS3Config = jest.mocked(getS3Config);

describe('DocumentsService', () => {
  const documentsRepository = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ ...x, id: 'doc-1' })),
    findOne: jest.fn(),
    find: jest.fn(),
    softDelete: jest.fn(),
  };
  const configService = { get: jest.fn() };
  const dataSource = { query: jest.fn() };

  let service: DocumentsService;
  let s3Client: { send: jest.Mock };
  const adminActor = {
    id: 'u1',
    companyId: 'co1',
    role: UserRole.ADMIN,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DocumentsService(
      documentsRepository as any,
      configService as any,
      dataSource as any,
    );
    s3Client = { send: jest.fn() };
    (service as any).s3Client = s3Client;
    (service as any).bucketName = 'bucket-test';
    dataSource.query.mockResolvedValue([{ id: 'l1' }]);
  });

  it('generateUploadUrl validates size and mime type', async () => {
    await expect(
      service.generateUploadUrl(
        {
          entityType: 'lease',
          entityId: 'l1',
          documentType: DocumentType.PHOTO,
          fileName: 'x.png',
          mimeType: 'image/png',
          fileSize: 9_000_000,
        } as any,
        adminActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.generateUploadUrl(
        {
          entityType: 'lease',
          entityId: 'l1',
          documentType: DocumentType.BANK_STATEMENT,
          fileName: 'x.png',
          mimeType: 'image/png',
          fileSize: 1000,
        } as any,
        adminActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('generateUploadUrl stores pending document and returns signed URL', async () => {
    const result = await service.generateUploadUrl(
      {
        entityType: 'lease',
        entityId: 'l1',
        documentType: DocumentType.OTHER,
        fileName: 'file.pdf',
        mimeType: 'application/pdf',
        fileSize: 1000,
      } as any,
      adminActor,
    );

    expect(documentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co1',
        entityType: 'lease',
        status: DocumentStatus.PENDING,
        fileUrl: expect.stringMatching(/^quarantine\/co1\/[a-f0-9]{48}$/),
      }),
    );
    expect(result.uploadUrl).toContain('https://signed.url');
    expect(documentsRepository.save).toHaveBeenCalled();
  });

  it('generateDownloadUrl throws when document not found and returns signed URL', async () => {
    documentsRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.generateDownloadUrl('missing', adminActor),
    ).rejects.toBeInstanceOf(NotFoundException);

    documentsRepository.findOne.mockResolvedValueOnce({
      id: 'doc-1',
      fileUrl: 'k',
      entityType: 'lease',
      entityId: 'l1',
    });
    await expect(
      service.generateDownloadUrl('doc-1', adminActor),
    ).resolves.toEqual({ downloadUrl: 'https://signed.url' });
    expect(documentsRepository.findOne).toHaveBeenLastCalledWith({
      where: {
        id: 'doc-1',
        companyId: 'co1',
        status: DocumentStatus.APPROVED,
      },
    });
  });

  it('confirmUpload throws when document not found', async () => {
    documentsRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.confirmUpload('missing', adminActor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('confirmUpload updates status and findByEntity lists documents', async () => {
    documentsRepository.findOne.mockResolvedValueOnce({
      id: 'doc-1',
      companyId: 'co1',
      entityType: 'lease',
      entityId: 'l1',
      fileUrl: 'quarantine/co1/opaque',
      fileSize: 1000,
      fileMimeType: 'application/pdf',
      status: DocumentStatus.PENDING,
    });
    s3Client.send
      .mockResolvedValueOnce({
        ContentLength: 1000,
        ContentType: 'application/pdf',
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    documentsRepository.save.mockImplementationOnce(async (x) => x);
    const confirmed = await service.confirmUpload('doc-1', adminActor);
    expect(confirmed.status).toBe(DocumentStatus.APPROVED);
    expect(confirmed.fileUrl).toMatch(/^documents\/co1\/[a-f0-9]{64}$/);
    expect(confirmed.verifiedBy).toBe('u1');
    expect(s3Client.send).toHaveBeenNthCalledWith(
      1,
      expect.any(HeadObjectCommand),
    );
    expect(s3Client.send).toHaveBeenNthCalledWith(
      2,
      expect.any(CopyObjectCommand),
    );
    expect(s3Client.send).toHaveBeenNthCalledWith(
      3,
      expect.any(DeleteObjectCommand),
    );

    documentsRepository.find.mockResolvedValue([{ id: 'doc-2' }]);
    await expect(
      service.findByEntity('lease', 'l1', adminActor),
    ).resolves.toEqual([{ id: 'doc-2' }]);
    expect(documentsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'co1',
          status: DocumentStatus.APPROVED,
        }),
      }),
    );
  });

  it('rejects a parent entity outside the authenticated company', async () => {
    dataSource.query.mockResolvedValue([]);

    await expect(
      service.generateUploadUrl(
        {
          entityType: 'lease',
          entityId: 'l1',
          documentType: DocumentType.OTHER,
          fileName: 'file.pdf',
          mimeType: 'application/pdf',
          fileSize: 1000,
        } as any,
        adminActor,
      ),
    ).rejects.toThrow('Document parent entity not found');
    expect(documentsRepository.save).not.toHaveBeenCalled();
  });

  it('rejects quarantine promotion when object metadata differs', async () => {
    documentsRepository.findOne.mockResolvedValue({
      id: 'doc-1',
      companyId: 'co1',
      entityType: 'lease',
      entityId: 'l1',
      fileUrl: 'quarantine/co1/opaque',
      fileSize: 1000,
      fileMimeType: 'application/pdf',
      status: DocumentStatus.PENDING,
    });
    s3Client.send.mockResolvedValue({
      ContentLength: 999,
      ContentType: 'application/pdf',
    });

    await expect(service.confirmUpload('doc-1', adminActor)).rejects.toThrow(
      'does not match',
    );
    expect(documentsRepository.save).not.toHaveBeenCalled();
  });

  it('keeps quarantine intact when persisting approval fails', async () => {
    documentsRepository.findOne.mockResolvedValue({
      id: 'doc-1',
      companyId: 'co1',
      entityType: 'lease',
      entityId: 'l1',
      fileUrl: 'quarantine/co1/opaque',
      fileSize: 1000,
      fileMimeType: 'application/pdf',
      status: DocumentStatus.PENDING,
    });
    s3Client.send
      .mockResolvedValueOnce({
        ContentLength: 1000,
        ContentType: 'application/pdf',
      })
      .mockResolvedValueOnce({});
    documentsRepository.save.mockRejectedValueOnce(new Error('db failure'));

    await expect(service.confirmUpload('doc-1', adminActor)).rejects.toThrow(
      'db failure',
    );
    expect(s3Client.send).toHaveBeenCalledTimes(2);
    expect(s3Client.send).not.toHaveBeenCalledWith(
      expect.any(DeleteObjectCommand),
    );
  });

  it('remove handles not found and soft delete after S3 deletion attempt', async () => {
    documentsRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.remove('missing', adminActor)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    documentsRepository.findOne.mockResolvedValueOnce({
      id: 'doc-1',
      fileUrl: 'lease/l1/file.pdf',
      entityType: 'lease',
      entityId: 'l1',
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    s3Client.send.mockRejectedValueOnce(new Error('s3 error'));

    await expect(service.remove('doc-1', adminActor)).resolves.toBeUndefined();
    expect(documentsRepository.softDelete).toHaveBeenCalledWith({
      id: 'doc-1',
      companyId: 'co1',
    });
  });

  it('rejects a same-company entity unrelated to the authenticated owner', async () => {
    dataSource.query.mockResolvedValue([]);
    const ownerActor = {
      id: 'owner-user-1',
      companyId: 'co1',
      role: UserRole.OWNER,
    };

    await expect(
      service.findByEntity('property', 'property-2', ownerActor),
    ).rejects.toThrow('Document parent entity not found');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('o.user_id = $3'),
      ['property-2', 'co1', 'owner-user-1'],
    );
    expect(documentsRepository.find).not.toHaveBeenCalled();
  });

  it('allows tenants only through an active rental relationship', async () => {
    const tenantActor = {
      id: 'tenant-user-1',
      companyId: 'co1',
      role: UserRole.TENANT,
    };
    documentsRepository.find.mockResolvedValue([]);

    await expect(
      service.findByEntity('maintenance_ticket', 'ticket-1', tenantActor),
    ).resolves.toEqual([]);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining("l.status = 'active'"),
      ['ticket-1', 'co1', 'tenant-user-1'],
    );
  });

  it('downloadByS3Key reads DB-backed file and throws when absent', async () => {
    documentsRepository.findOne.mockResolvedValueOnce({
      id: 'doc-1',
      fileData: Buffer.from('db-data'),
      fileMimeType: 'application/pdf',
    });
    await expect(
      service.downloadByS3Key('db://document/doc-1'),
    ).resolves.toEqual({
      buffer: Buffer.from('db-data'),
      contentType: 'application/pdf',
    });

    documentsRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.downloadByS3Key('db://document/missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('downloadByS3Key reads S3 stream and maps not found errors', async () => {
    s3Client.send.mockResolvedValueOnce({
      ContentType: 'application/pdf',
      Body: Readable.from([Buffer.from('s3')]),
    });
    await expect(service.downloadByS3Key('lease/l1/file.pdf')).resolves.toEqual(
      {
        buffer: Buffer.from('s3'),
        contentType: 'application/pdf',
      },
    );

    s3Client.send.mockRejectedValueOnce(new Error('missing'));
    await expect(service.downloadByS3Key('missing-key')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('onModuleInit / ensureBucketExists', () => {
    it('succeeds when bucket already exists', async () => {
      const mockClient = { send: jest.fn().mockResolvedValue({}) };
      mockedGetS3Config.mockReturnValue(mockClient as any);

      await service.onModuleInit();

      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });

    it('creates bucket when HeadBucket throws', async () => {
      const mockClient = {
        send: jest
          .fn()
          .mockRejectedValueOnce(new Error('NotFound'))
          .mockResolvedValueOnce({}),
      };
      mockedGetS3Config.mockReturnValue(mockClient as any);

      await service.onModuleInit();

      expect(mockClient.send).toHaveBeenCalledTimes(2);
    });

    it('logs error when bucket creation fails', async () => {
      const mockClient = {
        send: jest
          .fn()
          .mockRejectedValueOnce(new Error('NotFound'))
          .mockRejectedValueOnce(new Error('CreateFailed')),
      };
      mockedGetS3Config.mockReturnValue(mockClient as any);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await service.onModuleInit();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to create S3 bucket:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });
});
