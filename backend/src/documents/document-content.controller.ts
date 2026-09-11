import {
  Controller,
  Get,
  Put,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  StreamableFile,
  HttpCode,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { DocumentsService } from './documents.service';

// The signed capability authenticates these routes. Ordinary document routes
// still require JWT authentication and role/permission checks.
@Controller('documents')
export class DocumentContentController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Put(':id/content')
  @ApiConsumes(
    'application/octet-stream',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiQuery({ name: 'token', required: true, type: String })
  @Public()
  @HttpCode(204)
  async upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token: string | undefined,
    @Req() req: Request,
  ): Promise<void> {
    await this.documentsService.uploadContent(
      id,
      token,
      req.body,
      req.get('content-type'),
    );
  }

  @Get(':id/content')
  @ApiQuery({ name: 'token', required: true, type: String })
  @ApiOkResponse({
    content: {
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @Public()
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.documentsService.downloadContent(id, token);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.buffer, {
      type: file.contentType || 'application/octet-stream',
      length: file.buffer.length,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    });
  }
}
