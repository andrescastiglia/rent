import type { ZodType } from 'zod';
import {
  UserModulePermissions,
  UserRole,
} from '../../users/entities/user.entity';
import { AuthenticatedPolicy } from '../../common/decorators/authenticated.decorator';

export type AiToolsMode = 'NONE' | 'READONLY' | 'FULL';
export type AiToolMutability = 'readonly' | 'mutable';

export interface AiExecutionContext {
  userId: string;
  companyId?: string;
  conversationId?: string;
  role: UserRole;
  roles?: UserRole[];
  permissions?: UserModulePermissions;
  confirmMutation?: boolean;
  confirmationId?: string;
  mutationApprovalMode?: 'conversation' | 'staff_queue';
  mutationIntent?: boolean;
  roleDataContext?: string;
  idempotencyKey?: string;
}

export interface AiToolDefinition<TSchema extends ZodType = ZodType> {
  name: string;
  description: string;
  responseDescription?: string;
  mutability: AiToolMutability;
  /** Result is stored atomically with the domain mutation under context.idempotencyKey. */
  supportsIdempotentRecovery?: boolean;
  allowedRoles: UserRole[];
  requiredPermission?: AuthenticatedPolicy;
  parameters: TSchema;
  execute: (args: unknown, context: AiExecutionContext) => Promise<unknown>;
}
