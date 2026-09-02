import { DocumentsController } from './documents.controller';
import { UserRole } from '../users/entities/user.entity';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

describe('DocumentsController', () => {
  const documentsService = {
    generateUploadUrl: jest.fn(),
    confirmUpload: jest.fn(),
    generateDownloadUrl: jest.fn(),
    findByEntity: jest.fn(),
    remove: jest.fn(),
  };
  let controller: DocumentsController;
  const req = {
    user: { id: 'u1', companyId: 'co1', role: UserRole.OWNER },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DocumentsController(documentsService as any);
  });

  it('declares write and read role policies explicitly', () => {
    for (const endpoint of [
      'generateUploadUrl',
      'confirmUpload',
      'remove',
    ] as const) {
      expect(
        Reflect.getMetadata(ROLES_KEY, DocumentsController.prototype[endpoint]),
      ).toEqual([UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF]);
    }

    for (const endpoint of ['generateDownloadUrl', 'findByEntity'] as const) {
      expect(
        Reflect.getMetadata(ROLES_KEY, DocumentsController.prototype[endpoint]),
      ).toEqual([
        UserRole.ADMIN,
        UserRole.OWNER,
        UserRole.STAFF,
        UserRole.TENANT,
        UserRole.BUYER,
      ]);
    }
  });

  it('delegates upload/download/find operations', async () => {
    documentsService.generateUploadUrl.mockResolvedValue({ uploadUrl: 'u' });
    documentsService.confirmUpload.mockResolvedValue({ id: 'd1' });
    documentsService.generateDownloadUrl.mockResolvedValue({
      downloadUrl: 'd',
    });
    documentsService.findByEntity.mockResolvedValue([]);

    await expect(controller.generateUploadUrl({} as any, req)).resolves.toEqual(
      { uploadUrl: 'u' },
    );
    await expect(controller.confirmUpload('d1', req)).resolves.toEqual({
      id: 'd1',
    });
    await expect(controller.generateDownloadUrl('d1', req)).resolves.toEqual({
      downloadUrl: 'd',
    });
    await expect(controller.findByEntity('lease', 'l1', req)).resolves.toEqual(
      [],
    );

    expect(documentsService.generateUploadUrl).toHaveBeenCalledWith(
      {},
      req.user,
    );
    expect(documentsService.confirmUpload).toHaveBeenCalledWith('d1', req.user);
  });

  it('remove returns success message', async () => {
    documentsService.remove.mockResolvedValue(undefined);
    await expect(controller.remove('d1', req)).resolves.toEqual({
      message: 'Document deleted successfully',
    });
    expect(documentsService.remove).toHaveBeenCalledWith('d1', req.user);
  });
});
