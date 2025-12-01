import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  Patch,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DocumentsService } from './documents.service';
import { GenerateUploadUrlDto } from './dto/generate-upload-url.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('documents')
@UseGuards(AuthGuard('jwt'))
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload-url')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  generateUploadUrl(@Body() dto: GenerateUploadUrlDto, @Request() req: any) {
    return this.documentsService.generateUploadUrl(dto, req.user.id);
  }

  @Patch(':id/confirm')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  confirmUpload(@Param('id') id: string) {
    return this.documentsService.confirmUpload(id);
  }

  @Get(':id/download-url')
  generateDownloadUrl(@Param('id') id: string) {
    return this.documentsService.generateDownloadUrl(id);
  }

  @Get('entity/:type/:id')
  findByEntity(@Param('type') type: string, @Param('id') id: string) {
    return this.documentsService.findByEntity(type, id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async remove(@Param('id') id: string) {
    await this.documentsService.remove(id);
    return { message: 'Document deleted successfully' };
  }
}
