import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PropertiesService } from './properties.service';

@Controller('properties')
export class PropertyImagesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get('images/:imageId')
  @Public()
  async getPropertyImage(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const image = await this.propertiesService.getPropertyImage(imageId);

    res.setHeader('Content-Type', image.mimeType || 'application/octet-stream');
    res.setHeader(
      'Cache-Control',
      image.isTemporary ? 'no-store' : 'public, max-age=31536000, immutable',
    );
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(
        image.originalName || `${image.id}.img`,
      )}"`,
    );
    res.setHeader(
      'Content-Length',
      String(image.sizeBytes ?? image.data.length),
    );

    return new StreamableFile(image.data);
  }
}
