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
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserRole } from '../users/entities/user.entity';

type AuthenticatedRequest = {
  user: { id: string; companyId: string };
};

@UseGuards(AuthGuard('jwt'))
@Controller('documents')
@Authenticated('leases')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload-url')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  generateUploadUrl(
    @Body() dto: GenerateUploadUrlDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.documentsService.generateUploadUrl(
      dto,
      req.user.id,
      req.user.companyId,
    );
  }

  @Patch(':id/confirm')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  confirmUpload(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.documentsService.confirmUpload(
      id,
      req.user.companyId,
      req.user.id,
    );
  }

  @Get(':id/download-url')
  generateDownloadUrl(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.documentsService.generateDownloadUrl(id, req.user.companyId);
  }

  @Get('entity/:type/:id')
  findByEntity(
    @Param('type') type: string,
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.documentsService.findByEntity(type, id, req.user.companyId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    await this.documentsService.remove(id, req.user.companyId);
    return { message: 'Document deleted successfully' };
  }
}
