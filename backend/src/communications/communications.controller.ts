import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CommunicationsService } from './communications.service';
import {
  CreateCommunicationTemplateDto,
  PreviewCommunicationDto,
  TestCommunicationDto,
  UpdateCommunicationTemplateDto,
} from './dto/communication-template.dto';
import { ReplyCommunicationDto } from './dto/reply-communication.dto';

type AuthenticatedRequest = { user: { companyId: string } };

type StaffRequest = { user: { id: string; companyId: string } };

@Controller('communications')
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Authenticated('communications')
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Get('templates')
  listTemplates(@Request() req: AuthenticatedRequest) {
    return this.communicationsService.listTemplates(req.user.companyId);
  }

  @Post('templates')
  createTemplate(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateCommunicationTemplateDto,
  ) {
    return this.communicationsService.createTemplate(req.user.companyId, dto);
  }

  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateCommunicationTemplateDto,
  ) {
    return this.communicationsService.updateTemplate(
      id,
      req.user.companyId,
      dto,
    );
  }

  @Post('preview')
  preview(
    @Request() req: AuthenticatedRequest,
    @Body() dto: PreviewCommunicationDto,
  ) {
    return this.communicationsService.preview(req.user.companyId, dto);
  }

  @Post('test')
  sendTest(
    @Request() req: AuthenticatedRequest,
    @Body() dto: TestCommunicationDto,
  ) {
    return this.communicationsService.sendTest(req.user.companyId, dto);
  }

  @Get('deliveries')
  listDeliveries(@Request() req: AuthenticatedRequest) {
    return this.communicationsService.listDeliveries(req.user.companyId);
  }

  @Get('inbox')
  listInbox(@Request() req: AuthenticatedRequest) {
    return this.communicationsService.listInbox(req.user.companyId);
  }

  @Post('inbox/:id/read')
  markRead(@Param('id') id: string, @Request() req: StaffRequest) {
    return this.communicationsService.markInboxRead(id, req.user);
  }

  @Post('inbox/:id/reply')
  reply(
    @Param('id') id: string,
    @Request() req: StaffRequest,
    @Body() dto: ReplyCommunicationDto,
  ) {
    return this.communicationsService.replyToInbox(id, req.user, dto.body);
  }

  @Post('deliveries/:id/approve')
  approve(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.communicationsService.approve(id, req.user.companyId);
  }

  @Post('deliveries/:id/retry')
  retry(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.communicationsService.retry(id, req.user.companyId);
  }

  @Public()
  @Post('internal/retry-due')
  retryDue(@Headers('x-batch-communications-token') token?: string) {
    this.communicationsService.assertBatchToken(token);
    return this.communicationsService.retryDue();
  }
}
