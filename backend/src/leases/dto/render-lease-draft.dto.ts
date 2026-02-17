import { IsOptional, IsUUID } from 'class-validator';
import { z } from 'zod';

const renderLeaseDraftZodSchema = z
  .object({
    templateId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of template to render (uses lease default if omitted)'),
  })
  .strict();

export class RenderLeaseDraftDto {
  static readonly zodSchema = renderLeaseDraftZodSchema;

  @IsUUID()
  @IsOptional()
  templateId?: string;
}
