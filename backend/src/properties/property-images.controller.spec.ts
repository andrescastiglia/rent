import { StreamableFile } from '@nestjs/common';
import { PropertyImagesController } from './property-images.controller';

describe('PropertyImagesController', () => {
  const propertiesService = {
    getPropertyImage: jest.fn(),
  };

  const response = {
    setHeader: jest.fn(),
  } as any;

  let controller: PropertyImagesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PropertyImagesController(propertiesService as any);
  });

  it('returns the image stream with temporary cache headers', async () => {
    propertiesService.getPropertyImage.mockResolvedValue({
      id: 'image-1',
      originalName: 'foto principal.jpg',
      mimeType: 'image/jpeg',
      isTemporary: true,
      sizeBytes: 512,
      data: Buffer.from('image-content'),
    });

    const result = await controller.getPropertyImage('image-1', response);

    expect(result).toBeInstanceOf(StreamableFile);
    expect(propertiesService.getPropertyImage).toHaveBeenCalledWith('image-1');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/jpeg',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="foto%20principal.jpg"',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', '512');
  });

  it('uses fallback headers for permanent images without metadata', async () => {
    propertiesService.getPropertyImage.mockResolvedValue({
      id: 'image-2',
      originalName: null,
      mimeType: null,
      isTemporary: false,
      sizeBytes: null,
      data: Buffer.from('fallback'),
    });

    await controller.getPropertyImage('image-2', response);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/octet-stream',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=31536000, immutable',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="image-2.img"',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Length',
      String(Buffer.from('fallback').length),
    );
  });
});
