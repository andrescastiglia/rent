import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RejectPendingActionDto } from './dto/reject-pending-action.dto';
import { PendingActionsService } from './pending-actions.service';

type StaffRequest = {
  user: { id: string; companyId: string; role: UserRole };
};

@Controller('pending-actions')
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class PendingActionsController {
  constructor(private readonly service: PendingActionsService) {}

  @Get()
  list(@Request() request: StaffRequest) {
    return this.service.list(request.user.companyId);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Request() request: StaffRequest) {
    return this.service.approve(id, request.user);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Request() request: StaffRequest,
    @Body() dto: RejectPendingActionDto,
  ) {
    return this.service.reject(id, request.user, dto.reason);
  }
}
