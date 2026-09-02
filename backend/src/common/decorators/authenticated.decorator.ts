import { SetMetadata } from '@nestjs/common';
import { UserModulePermissionKey } from '../../users/entities/user.entity';

export const AUTHENTICATED_KEY = 'authenticated';

export type AuthenticatedPolicy = UserModulePermissionKey | 'self-service';

export const Authenticated = (policy: AuthenticatedPolicy = 'self-service') =>
  SetMetadata(AUTHENTICATED_KEY, policy);
