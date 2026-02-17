import { IsOptional, IsString, IsUUID } from 'class-validator';
import { z } from 'zod';

const createPropertyReservationZodSchema = z
  .object({
    propertyId: z.string().uuid().describe('UUID of the property to reserve'),
    notes: z.string().optional(),
    activitySource: z
      .string()
      .optional()
      .describe('Source of the reservation activity'),
  })
  .strict();

export class CreatePropertyReservationDto {
  static readonly zodSchema = createPropertyReservationZodSchema;

  @IsUUID()
  propertyId: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  activitySource?: string;
}
