import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { z } from 'zod';

const createSaleFolderZodSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
  })
  .strict();

export class CreateSaleFolderDto {
  static readonly zodSchema = createSaleFolderZodSchema;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}
