import { IsJWT, IsNotEmpty, IsString } from 'class-validator';
import { z } from 'zod';

const approvePendingActionZodSchema = z
  .object({ reauthToken: z.string().min(1) })
  .strict();

export class ApprovePendingActionDto {
  static readonly zodSchema = approvePendingActionZodSchema;

  @IsString()
  @IsNotEmpty()
  @IsJWT()
  reauthToken: string;
}
