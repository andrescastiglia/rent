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

interface AuthenticatedRequest {
  user: {
    id: string;
    companyId: string;
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller('leases')
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  create(@Body() createLeaseDto: CreateLeaseDto) {
    return this.leasesService.create(createLeaseDto);
  }

  @Get()
  findAll(@Query() filters: LeaseFiltersDto) {
    return this.leasesService.findAll(filters);
  }

  @Get('templates')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  listTemplates(
    @Query('contractType') contractType: ContractType | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    if (
      contractType &&
      !Object.values(ContractType).includes(contractType as ContractType)
    ) {
      throw new BadRequestException('Invalid contract type');
    }
    return this.leasesService.listTemplates(req.user.companyId, contractType);
  }

  @Post('templates')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  createTemplate(
    @Body() dto: CreateLeaseContractTemplateDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.leasesService.createTemplate(dto, req.user.companyId);
  }

  @Patch('templates/:templateId')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
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
  findOne(@Param('id') id: string) {
    return this.leasesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  update(@Param('id') id: string, @Body() updateLeaseDto: UpdateLeaseDto) {
    return this.leasesService.update(id, updateLeaseDto);
  }

  @Post(':id/draft/render')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  renderDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenderLeaseDraftDto,
  ) {
    return this.leasesService.renderDraft(id, dto.templateId);
  }

  @Patch(':id/draft-text')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  updateDraftText(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaseDraftTextDto,
  ) {
    return this.leasesService.updateDraftText(id, dto.draftText);
  }

  @Post(':id/confirm')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  confirmDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmLeaseDraftDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.leasesService.confirmDraft(id, req.user.id, dto.finalText);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  activate(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.leasesService.activate(id, req.user.id);
  }

  @Patch(':id/terminate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  terminate(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.leasesService.terminate(id, reason);
  }

  @Patch(':id/finalize')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  finalize(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.leasesService.terminate(id, reason);
  }

  @Patch(':id/renew')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  renew(@Param('id') id: string, @Body() newTerms: Partial<CreateLeaseDto>) {
    return this.leasesService.renew(id, newTerms);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async remove(@Param('id') id: string) {
    await this.leasesService.remove(id);
    return { message: 'Lease deleted successfully' };
  }
}
