import { ZodTypeAny } from 'zod';
import { UserRole } from '../../users/entities/user.entity';

export type AiToolsMode = 'NONE' | 'READONLY' | 'FULL';
export type AiToolMutability = 'readonly' | 'mutable';

export interface AiExecutionContext {
  userId: string;
  companyId?: string;
  role: UserRole;
}

export interface AiToolDefinition<TSchema extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  responseDescription?: string;
  mutability: AiToolMutability;
  allowedRoles: UserRole[];
  parameters: TSchema;
  execute: (args: unknown, context: AiExecutionContext) => Promise<unknown>;
}
