import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from '../../users/entities/admin.entity';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Admin)
    private readonly adminsRepository: Repository<Admin>,
  ) {}

  async getAdminByUserId(userId: string): Promise<Admin | null> {
    return this.adminsRepository.findOne({ where: { userId } });
  }

  async isSuperAdmin(user: User): Promise<boolean> {
    if (user.role !== 'admin') {
      return false;
    }
    const admin = await this.getAdminByUserId(user.id);
    return admin?.isSuperAdmin || false;
  }

  async hasPermission(
    user: User,
    resource: string,
    action: string,
  ): Promise<boolean> {
    // Non-admins don't have granular permissions
    if (user.role !== 'admin') {
      return false;
    }

    const admin = await this.getAdminByUserId(user.id);
    if (!admin) {
      return false;
    }

    // Super admins have all permissions
    if (admin.isSuperAdmin) {
      return true;
    }

    // Check granular permissions
    const resourcePermissions = (admin.permissions as any)[resource];
    if (!resourcePermissions) {
      return false;
    }

    return resourcePermissions[action] === true;
  }

  async hasAnyPermission(
    user: User,
    permissions: Array<{ resource: string; action: string }>,
  ): Promise<boolean> {
    for (const permission of permissions) {
      const hasPermission = await this.hasPermission(
        user,
        permission.resource,
        permission.action,
      );
      if (hasPermission) {
        return true;
      }
    }
    return false;
  }

  async hasAllPermissions(
    user: User,
    permissions: Array<{ resource: string; action: string }>,
  ): Promise<boolean> {
    for (const permission of permissions) {
      const hasPermission = await this.hasPermission(
        user,
        permission.resource,
        permission.action,
      );
      if (!hasPermission) {
        return false;
      }
    }
    return true;
  }
}
