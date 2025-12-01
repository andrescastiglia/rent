import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('test')
export class TestController {
  @Roles(UserRole.ADMIN)
  @Get('admin-only')
  adminOnly() {
    return { message: 'This endpoint is only accessible by admins' };
  }

  @Roles(UserRole.OWNER)
  @Get('owner-only')
  ownerOnly() {
    return { message: 'This endpoint is only accessible by owners' };
  }

  @Roles(UserRole.TENANT)
  @Get('tenant-only')
  tenantOnly() {
    return { message: 'This endpoint is only accessible by tenants' };
  }

  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Get('admin-or-owner')
  adminOrOwner() {
    return { message: 'This endpoint is accessible by admins or owners' };
  }

  @RequirePermissions({ resource: 'users', action: 'create' })
  @Get('create-user-permission')
  createUserPermission() {
    return { message: 'This endpoint requires permission to create users' };
  }
}
