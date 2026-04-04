import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DigitalSignaturesService } from './digital-signatures.service';
import { DigitalSignatureRequest } from './entities/digital-signature-request.entity';
import { CreateSignatureRequestDto } from './dto/create-signature-request.dto';
import { WebhookEventDto } from './dto/webhook-event.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
  };
}

@Controller('digital-signatures')
@UseGuards(JwtAuthGuard)
export class DigitalSignaturesController {
  constructor(
    private readonly digitalSignaturesService: DigitalSignaturesService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query('leaseId') leaseId?: string,
  ): Promise<DigitalSignatureRequest[]> {
    return this.digitalSignaturesService.findAll(req.user.companyId, leaseId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<DigitalSignatureRequest> {
    return this.digitalSignaturesService.findOne(id, req.user.companyId);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async create(
    @Body() dto: CreateSignatureRequestDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<DigitalSignatureRequest> {
    return this.digitalSignaturesService.create(req.user.companyId, dto);
  }

  @Post(':id/void')
  @Roles(UserRole.ADMIN)
  async void(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<DigitalSignatureRequest> {
    return this.digitalSignaturesService.void(id, req.user.companyId);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  async processWebhook(@Body() dto: WebhookEventDto): Promise<void> {
    return this.digitalSignaturesService.processWebhook(dto);
  }
}
