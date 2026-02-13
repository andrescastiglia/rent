import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import { z } from 'zod';

const discardPropertyImagesZodSchema = z
  .object({
    images: z.array(z.string()).nonempty(),
  })
  .strict();

export class DiscardPropertyImagesDto {
  static readonly zodSchema = discardPropertyImagesZodSchema;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  images: string[];
}
