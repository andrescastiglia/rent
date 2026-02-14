import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LeasesService } from './leases.service';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { LeaseFiltersDto } from './dto/lease-filters.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ContractType } from './entities/lease.entity';
import { CreateLeaseContractTemplateDto } from './dto/create-lease-contract-template.dto';
import { UpdateLeaseContractTemplateDto } from './dto/update-lease-contract-template.dto';
import { RenderLeaseDraftDto } from './dto/render-lease-draft.dto';
import { UpdateLeaseDraftTextDto } from './dto/update-lease-draft-text.dto';
import { ConfirmLeaseDraftDto } from './dto/confirm-lease-draft.dto';
import { LeaseTemplateFiltersDto } from './dto/lease-template-filters.dto';
import { LeaseStatusReasonDto } from './dto/lease-status-reason.dto';
import { RenewLeaseDto } from './dto/renew-lease.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    companyId: string;
    role: UserRole;
    email?: string | null;
    phone?: string | null;
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller('leases')
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  create(@Body() createLeaseDto: CreateLeaseDto) {
    return this.leasesService.create(createLeaseDto);
  }

  @Get()
  findAll(
    @Query() filters: LeaseFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.leasesService.findAll(filters, req.user);
  }

  @Get('templates')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  listTemplates(
    @Query() query: LeaseTemplateFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const { contractType } = query;
    if (
      contractType &&
      !Object.values(ContractType).includes(contractType as ContractType) // NOSONAR
    ) {
      throw new BadRequestException('Invalid contract type');
    }
    return this.leasesService.listTemplates(req.user.companyId, contractType);
  }

  @Post('templates')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  createTemplate(
    @Body() dto: CreateLeaseContractTemplateDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.leasesService.createTemplate(dto, req.user.companyId);
  }

  @Patch('templates/:templateId')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  updateTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: UpdateLeaseContractTemplateDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.leasesService.updateTemplate(
      templateId,
      dto,
      req.user.companyId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.leasesService.findOneScoped(id, req.user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  update(@Param('id') id: string, @Body() updateLeaseDto: UpdateLeaseDto) {
    return this.leasesService.update(id, updateLeaseDto);
  }

  @Post(':id/draft/render')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  renderDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenderLeaseDraftDto,
  ) {
    return this.leasesService.renderDraft(id, dto.templateId);
  }

  @Patch(':id/draft-text')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  updateDraftText(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaseDraftTextDto,
  ) {
    return this.leasesService.updateDraftText(id, dto.draftText);
  }

  @Post(':id/confirm')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  confirmDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmLeaseDraftDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.leasesService.confirmDraft(id, req.user.id, dto.finalText);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  activate(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.leasesService.activate(id, req.user.id);
  }

  @Patch(':id/terminate')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  terminate(@Param('id') id: string, @Body() dto: LeaseStatusReasonDto) {
    return this.leasesService.terminate(id, dto.reason);
  }

  @Patch(':id/finalize')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  finalize(@Param('id') id: string, @Body() dto: LeaseStatusReasonDto) {
    return this.leasesService.terminate(id, dto.reason);
  }

  @Patch(':id/renew')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  renew(@Param('id') id: string, @Body() newTerms: RenewLeaseDto) {
    return this.leasesService.renew(id, newTerms);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async remove(@Param('id') id: string) {
    await this.leasesService.remove(id);
    return { message: 'Lease deleted successfully' };
  }
}
