import { IsBoolean } from 'class-validator';
import { z } from 'zod';

const setUserActivationZodSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export class SetUserActivationDto {
  static readonly zodSchema = setUserActivationZodSchema;

  @IsBoolean()
  isActive: boolean;
}
