import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import {
  GenerateSettlementDto,
  SettlementGenerationDto,
  VoidSettlementGenerationDto,
  SettlementGenerationOverviewDto,
  SettlementGenerationOverviewQueryDto,
  CancelSettlementGenerationRequestDto,
} from './dto/settlement-generation.dto';
import { SettlementGenerationService } from './settlement-generation.service';
type Actor = { user: { id: string; companyId: string } };
@Controller('settlements')
@Roles(UserRole.ADMIN)
export class SettlementGenerationController {
  constructor(private readonly generations: SettlementGenerationService) {}
  @Get('generation/overview')
  @ApiOkResponse({ type: SettlementGenerationOverviewDto })
  overview(
    @Request() req: Actor,
    @Query() query: SettlementGenerationOverviewQueryDto,
  ) {
    return this.generations.overview(req.user.companyId, query);
  }
  @Post('generation/cancel-request')
  @ApiCreatedResponse({ type: SettlementGenerationOverviewDto })
  cancelRequest(
    @Request() req: Actor,
    @Body() dto: CancelSettlementGenerationRequestDto,
  ) {
    return this.generations.cancelRequest(req.user.companyId, req.user.id, dto);
  }
  @Post('generate')
  @ApiCreatedResponse({ type: SettlementGenerationDto })
  generate(@Request() req: Actor, @Body() dto: GenerateSettlementDto) {
    return this.generations.generate(req.user.companyId, req.user.id, dto);
  }
  @Get(':id/generation')
  @ApiOkResponse({ type: SettlementGenerationDto })
  get(@Request() req: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.generations.get(id, req.user.companyId);
  }
  @Post(':id/generation/void')
  @ApiCreatedResponse({ type: SettlementGenerationDto })
  void(
    @Request() req: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidSettlementGenerationDto,
  ) {
    return this.generations.void(req.user.companyId, req.user.id, id, dto);
  }
}
