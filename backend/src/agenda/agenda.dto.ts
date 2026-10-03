import { z } from 'zod';
import { Allow } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
export const taskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(10000).nullable().optional(),
    kind: z.enum(['call', 'task', 'visit']).default('task'),
    personType: z
      .enum(['interested', 'tenant', 'owner', 'buyer', 'user'])
      .nullable()
      .optional(),
    personId: z.uuid().nullable().optional(),
    responsibleUserId: z.uuid().nullable().optional(),
    scheduledDate: z.iso.date().nullable().optional(),
    scheduledAt: z.iso.datetime({ offset: true }).nullable().optional(),
    endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
    reminderMinutes: z.number().int().min(0).max(10080).optional(),
    reminderHour: z.number().int().min(0).max(23).optional(),
    status: z.enum(['pending', 'completed', 'cancelled']).default('pending'),
    relatedEntryId: z.string().max(160).nullable().optional(),
    sourceCommunicationId: z.uuid().optional(),
  })
  .strict();
export const updateTaskSchema = taskSchema
  .partial()
  .extend({
    kind: z.enum(['call', 'task', 'visit']).optional(),
    reminderMinutes: z.number().int().min(0).max(10080).optional(),
    reminderHour: z.number().int().min(0).max(23).optional(),
    status: z.enum(['pending', 'completed', 'cancelled']).optional(),
    version: z.number().int().positive(),
  })
  .strict();
export type TaskInput = z.input<typeof taskSchema>;
// Runtime validation is shared by HTTP and AI; Allow lets the global whitelist preserve the fields.
export class AgendaTaskDto {
  static readonly zodSchema: z.ZodType = taskSchema;
  @Allow() title: string;
  @Allow() description?: string | null;
  @Allow() kind?: 'call' | 'task' | 'visit';
  @Allow() personType?:
    'interested' | 'tenant' | 'owner' | 'buyer' | 'user' | null;
  @Allow() personId?: string | null;
  @Allow() responsibleUserId?: string | null;
  @Allow() scheduledDate?: string | null;
  @Allow() scheduledAt?: string | null;
  @Allow() endsAt?: string | null;
  @Allow() reminderMinutes?: number;
  @Allow() reminderHour?: number;
  @Allow() status?: 'pending' | 'completed' | 'cancelled';
  @Allow() relatedEntryId?: string | null;
  @Allow() sourceCommunicationId?: string;
}
export class UpdateAgendaTaskDto extends PartialType(AgendaTaskDto) {
  static readonly zodSchema = updateTaskSchema;
  @Allow() version: number;
}
export const agendaQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    search: z.string().max(200).optional(),
    personType: z.string().optional(),
    personId: z.uuid().optional(),
    responsibleUserId: z.union([z.uuid(), z.literal('unassigned')]).optional(),
    kind: z.string().optional(),
    status: z
      .enum(['pending', 'completed', 'cancelled', 'all'])
      .default('pending'),
    unscheduled: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type AgendaQuery = z.input<typeof agendaQuerySchema>;
export type AgendaActor = {
  id: string;
  companyId: string;
  role: string;
  roles?: string[];
  permissions?: Record<string, boolean>;
};
export type AgendaEntry = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  personType: string | null;
  personId: string | null;
  personName: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  scheduledDate: string | null;
  scheduledAt: string | null;
  endsAt: string | null;
  reminderMinutes: number;
  reminderHour: number;
  reminderAt: string | null;
  status: string;
  version: string;
  editable: boolean;
  sourceType: string | null;
  sourceId: string | null;
  relatedEntryId: string | null;
  timezone: string;
  updatedAt: string;
  canEdit: boolean;
};
