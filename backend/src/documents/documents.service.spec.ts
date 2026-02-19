import { Readable } from 'stream';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentStatus, DocumentType } from './entities/document.entity';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async () => 'https://signed.url'),
}));

jest.mock('../config/s3.config', () => ({
  S3_BUCKET_NAME: 'bucket-test',
  getS3Config: jest.fn(),
}));

describe('DocumentsService', () => {
  const documentsRepository = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ ...x, id: 'doc-1' })),
    findOne: jest.fn(),
    find: jest.fn(),
    softDelete: jest.fn(),
  };
  const configService = {};

  let service: DocumentsService;
  let s3Client: { send: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DocumentsService(
      documentsRepository as any,
      configService as any,
    );
    s3Client = { send: jest.fn() };
    (service as any).s3Client = s3Client;
    (service as any).bucketName = 'bucket-test';
  });

  it('generateUploadUrl validates size and mime type', async () => {
    await expect(
      service.generateUploadUrl(
        {
          companyId: 'co1',
          entityType: 'lease',
          entityId: 'l1',
          documentType: DocumentType.PHOTO,
          fileName: 'x.png',
          mimeType: 'image/png',
          fileSize: 9_000_000,
        } as any,
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.generateUploadUrl(
        {
          companyId: 'co1',
          entityType: 'lease',
          entityId: 'l1',
          documentType: DocumentType.BANK_STATEMENT,
          fileName: 'x.png',
          mimeType: 'image/png',
          fileSize: 1000,
        } as any,
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('generateUploadUrl stores pending document and returns signed URL', async () => {
    const result = await service.generateUploadUrl(
      {
        companyId: 'co1',
        entityType: 'lease',
        entityId: 'l1',
        documentType: DocumentType.OTHER,
        fileName: 'file.pdf',
        mimeType: 'application/pdf',
        fileSize: 1000,
      } as any,
      'u1',
    );

    expect(documentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: DocumentStatus.PENDING }),
    );
    expect(result.uploadUrl).toContain('https://signed.url');
    expect(documentsRepository.save).toHaveBeenCalled();
  });

  it('generateDownloadUrl throws when document not found and returns signed URL', async () => {
    documentsRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.generateDownloadUrl('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    documentsRepository.findOne.mockResolvedValueOnce({
      id: 'doc-1',
      fileUrl: 'k',
    });
    await expect(service.generateDownloadUrl('doc-1')).resolves.toEqual({
      downloadUrl: 'https://signed.url',
    });
  });

  it('confirmUpload updates status and findByEntity lists documents', async () => {
    documentsRepository.findOne.mockResolvedValueOnce({
      id: 'doc-1',
      status: DocumentStatus.PENDING,
    });
    documentsRepository.save.mockImplementationOnce(async (x) => x);
    const confirmed = await service.confirmUpload('doc-1');
    expect(confirmed.status).toBe(DocumentStatus.APPROVED);

    documentsRepository.find.mockResolvedValue([{ id: 'doc-2' }]);
    await expect(service.findByEntity('lease', 'l1')).resolves.toEqual([
      { id: 'doc-2' },
    ]);
  });

  it('remove handles not found and soft delete after S3 deletion attempt', async () => {
    documentsRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    documentsRepository.findOne.mockResolvedValueOnce({
      id: 'doc-1',
      fileUrl: 'lease/l1/file.pdf',
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    s3Client.send.mockRejectedValueOnce(new Error('s3 error'));

    await expect(service.remove('doc-1')).resolves.toBeUndefined();
    expect(documentsRepository.softDelete).toHaveBeenCalledWith('doc-1');
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
});
