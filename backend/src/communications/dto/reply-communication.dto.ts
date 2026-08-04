import { IsString, MaxLength, MinLength } from 'class-validator';
import { z } from 'zod';

export class ReplyCommunicationDto {
  static readonly zodSchema = z
    .object({ body: z.string().min(1).max(4096) })
    .strict();

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  body: string;
}
