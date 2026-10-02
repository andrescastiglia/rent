import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SelfServiceAction } from '../common/decorators/self-service-action.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DocumentActor } from '../documents/documents.service';
import { MaintenanceAttachmentDto } from './dto/maintenance-attachment.dto';
import { MaintenanceAttachmentsService } from './maintenance-attachments.service';

@ApiTags('maintenance')
@Controller('maintenance/tickets/:id/attachments')
@UseGuards(JwtAuthGuard)
@Authenticated('maintenance')
@Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER, UserRole.TENANT)
export class MaintenanceAttachmentsController {
  constructor(private readonly service: MaintenanceAttachmentsService) {}
  @Post('upload-url')
  @SelfServiceAction('maintenance.attachment.upload')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MaintenanceAttachmentDto,
    @Request() req: { user: DocumentActor },
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.create(id, dto, req.user, key);
  }
  @Patch(':documentId/confirm')
  @SelfServiceAction('maintenance.attachment.confirm')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Request() req: { user: DocumentActor },
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.confirm(id, documentId, req.user, key);
  }
}
