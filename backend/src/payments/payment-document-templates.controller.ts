import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CreatePaymentDocumentTemplateDto } from './dto/create-payment-document-template.dto';
import { PaymentDocumentTemplateFiltersDto } from './dto/payment-document-template-filters.dto';
import { UpdatePaymentDocumentTemplateDto } from './dto/update-payment-document-template.dto';
import { PaymentDocumentTemplatesService } from './payment-document-templates.service';

interface AuthenticatedRequest {
  user: {
    companyId: string;
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller('payment-templates')
export class PaymentDocumentTemplatesController {
  constructor(
    private readonly templatesService: PaymentDocumentTemplatesService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  list(
    @Query() filters: PaymentDocumentTemplateFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.templatesService.list(req.user.companyId, filters.type);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  create(
    @Body() dto: CreatePaymentDocumentTemplateDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.templatesService.create(dto, req.user.companyId);
  }

  @Patch(':templateId')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  update(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: UpdatePaymentDocumentTemplateDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.templatesService.update(templateId, dto, req.user.companyId);
  }
}
