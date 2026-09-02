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
  user: { id: string; companyId: string; role: UserRole };
};

@UseGuards(AuthGuard('jwt'))
@Controller('documents')
@Authenticated('leases')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload-url')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  generateUploadUrl(
    @Body() dto: GenerateUploadUrlDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.documentsService.generateUploadUrl(dto, req.user);
  }

  @Patch(':id/confirm')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  confirmUpload(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.documentsService.confirmUpload(id, req.user);
  }

  @Get(':id/download-url')
  @Roles(
    UserRole.ADMIN,
    UserRole.OWNER,
    UserRole.STAFF,
    UserRole.TENANT,
    UserRole.BUYER,
  )
  generateDownloadUrl(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.documentsService.generateDownloadUrl(id, req.user);
  }

  @Get('entity/:type/:id')
  @Roles(
    UserRole.ADMIN,
    UserRole.OWNER,
    UserRole.STAFF,
    UserRole.TENANT,
    UserRole.BUYER,
  )
  findByEntity(
    @Param('type') type: string,
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.documentsService.findByEntity(type, id, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  async remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    await this.documentsService.remove(id, req.user);
    return { message: 'Document deleted successfully' };
  }
}
