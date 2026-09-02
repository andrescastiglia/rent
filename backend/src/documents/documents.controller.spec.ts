import { DocumentsController } from './documents.controller';

describe('DocumentsController', () => {
  const documentsService = {
    generateUploadUrl: jest.fn(),
    confirmUpload: jest.fn(),
    generateDownloadUrl: jest.fn(),
    findByEntity: jest.fn(),
    remove: jest.fn(),
  };
  let controller: DocumentsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DocumentsController(documentsService as any);
  });

  it('delegates upload/download/find operations', async () => {
    documentsService.generateUploadUrl.mockResolvedValue({ uploadUrl: 'u' });
    documentsService.confirmUpload.mockResolvedValue({ id: 'd1' });
    documentsService.generateDownloadUrl.mockResolvedValue({
      downloadUrl: 'd',
    });
    documentsService.findByEntity.mockResolvedValue([]);

    await expect(
      controller.generateUploadUrl(
        {} as any,
        { user: { id: 'u1', companyId: 'co1' } } as any,
      ),
    ).resolves.toEqual({ uploadUrl: 'u' });
    await expect(
      controller.confirmUpload('d1', {
        user: { id: 'u1', companyId: 'co1' },
      }),
    ).resolves.toEqual({ id: 'd1' });
    await expect(
      controller.generateDownloadUrl('d1', {
        user: { id: 'u1', companyId: 'co1' },
      }),
    ).resolves.toEqual({ downloadUrl: 'd' });
    await expect(
      controller.findByEntity('lease', 'l1', {
        user: { id: 'u1', companyId: 'co1' },
      }),
    ).resolves.toEqual([]);

    expect(documentsService.generateUploadUrl).toHaveBeenCalledWith(
      {},
      'u1',
      'co1',
    );
    expect(documentsService.confirmUpload).toHaveBeenCalledWith(
      'd1',
      'co1',
      'u1',
    );
  });

  it('remove returns success message', async () => {
    documentsService.remove.mockResolvedValue(undefined);
    await expect(
      controller.remove('d1', {
        user: { id: 'u1', companyId: 'co1' },
      }),
    ).resolves.toEqual({
      message: 'Document deleted successfully',
    });
    expect(documentsService.remove).toHaveBeenCalledWith('d1', 'co1');
  });
});
