import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RejectPendingActionDto } from './dto/reject-pending-action.dto';
import { PendingActionsService } from './pending-actions.service';
import { ApprovePendingActionDto } from './dto/approve-pending-action.dto';

type StaffRequest = {
  user: { id: string; companyId: string; role: UserRole };
};

@Controller('pending-actions')
@Roles(UserRole.ADMIN, UserRole.STAFF)
@Authenticated('approvals')
export class PendingActionsController {
  constructor(private readonly service: PendingActionsService) {}

  @Get()
  list(@Request() request: StaffRequest) {
    return this.service.list(request.user.companyId);
  }

  @Post(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() request: StaffRequest,
    @Body() dto: ApprovePendingActionDto,
  ) {
    return this.service.approve(id, request.user, dto.reauthToken);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() request: StaffRequest,
    @Body() dto: RejectPendingActionDto,
  ) {
    return this.service.reject(id, request.user, dto.reason);
  }
}
