import { PropertiesController } from './properties.controller';

describe('PropertiesController', () => {
  const propertiesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOneScoped: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    uploadPropertyImage: jest.fn(),
    discardUploadedImages: jest.fn(),
  };

  let controller: PropertiesController;
  const req = { user: { id: 'u1', role: 'admin', companyId: 'c1' } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PropertiesController(propertiesService as any);
  });

  it('delegates property CRUD and upload operations', async () => {
    propertiesService.create.mockResolvedValue({ id: 'p1' });
    propertiesService.findAll.mockResolvedValue({ data: [] });
    propertiesService.findOneScoped.mockResolvedValue({ id: 'p1' });
    propertiesService.update.mockResolvedValue({ id: 'p1', name: 'A' });
    propertiesService.uploadPropertyImage.mockResolvedValue({ id: 'img1' });
    propertiesService.discardUploadedImages.mockResolvedValue({ discarded: 1 });

    await expect(controller.create({} as any, req)).resolves.toEqual({
      id: 'p1',
    });
    await expect(controller.findAll({} as any, req)).resolves.toEqual({
      data: [],
    });
    await expect(controller.findOne('p1', req)).resolves.toEqual({ id: 'p1' });
    await expect(controller.update('p1', {} as any, req)).resolves.toEqual({
      id: 'p1',
      name: 'A',
    });
    await expect(
      controller.uploadPropertyImage({} as any, req),
    ).resolves.toEqual({
      id: 'img1',
    });
    await expect(
      controller.discardUploadedImages({ images: ['x'] } as any, req),
    ).resolves.toEqual({ discarded: 1 });
  });

  it('remove returns success message', async () => {
    propertiesService.remove.mockResolvedValue(undefined);
    await expect(controller.remove('p1', req)).resolves.toEqual({
      message: 'Property deleted successfully',
    });
  });
});
