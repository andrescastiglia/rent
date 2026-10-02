import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import {
  ApplyInterestedImportDto,
  ApplyInterestedMergeDto,
  ConfigureInterestedPipelineDto,
  MoveInterestedPipelineDto,
  PreviewInterestedImportDto,
  PreviewInterestedMergeDto,
} from './dto/assisted-workflow.dto';
import { InterestedWorkflowService } from './interested-workflow.service';

type StaffRequest = { user: { id: string; companyId: string; role: string } };
@ApiTags('interested')
@UseGuards(AuthGuard('jwt'))
@Authenticated('interested')
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Controller('interested/workflow')
export class InterestedWorkflowController {
  constructor(private readonly service: InterestedWorkflowService) {}
  @Post('import/preview')
  previewImport(
    @Body() dto: PreviewInterestedImportDto,
    @Request() req: StaffRequest,
  ) {
    return this.service.previewImport(dto.rows, req.user);
  }
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('import')
  applyImport(
    @Body() dto: ApplyInterestedImportDto,
    @Request() req: StaffRequest,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.applyImport(dto, req.user, key);
  }
  @Post('merge/preview')
  previewMerge(
    @Body() dto: PreviewInterestedMergeDto,
    @Request() req: StaffRequest,
  ) {
    return this.service.previewMerge(dto, req.user);
  }
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('merge')
  merge(
    @Body() dto: ApplyInterestedMergeDto,
    @Request() req: StaffRequest,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.merge(dto, req.user, key);
  }
  @Get('pipeline')
  pipeline(@Request() req: StaffRequest) {
    return this.service.pipeline(req.user);
  }
  @Roles(UserRole.ADMIN)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Patch('pipeline')
  configurePipeline(
    @Body() dto: ConfigureInterestedPipelineDto,
    @Request() req: StaffRequest,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.configurePipeline(dto, req.user, key);
  }
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Patch('pipeline/:id')
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveInterestedPipelineDto,
    @Request() req: StaffRequest,
    @Headers('idempotency-key') key: string,
  ) {
    return this.service.move(id, dto.stageId, req.user, key);
  }
}
