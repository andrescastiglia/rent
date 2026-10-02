import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { z } from 'zod';
import { CreateInterestedProfileDto } from './create-interested-profile.dto';

const rows = z.array(CreateInterestedProfileDto.zodSchema).min(1).max(200);
export class PreviewInterestedImportDto {
  static readonly zodSchema = z.object({ rows }).strict();
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  rows: CreateInterestedProfileDto[];
}
export class ApplyInterestedImportDto extends PreviewInterestedImportDto {
  static readonly zodSchema = z
    .object({
      rows,
      reviewToken: z.string().max(2048),
      skipRows: z.array(z.number().int().min(0).max(199)).max(200),
    })
    .strict();
  @IsString() reviewToken: string;
  @IsArray() skipRows: number[];
}
export class PreviewInterestedMergeDto {
  static readonly zodSchema = z
    .object({ targetId: z.uuid(), sourceId: z.uuid() })
    .strict();
  @IsUUID() targetId: string;
  @IsUUID() sourceId: string;
}
export class ApplyInterestedMergeDto extends PreviewInterestedMergeDto {
  static readonly zodSchema = PreviewInterestedMergeDto.zodSchema.extend({
    reviewToken: z.string().max(2048),
  });
  @IsString() reviewToken: string;
}
const stage = z
  .object({
    id: z.string().regex(/^[a-z][a-z\d_]{0,39}$/),
    label: z.string().trim().min(1).max(80),
  })
  .strict();
export class ConfigureInterestedPipelineDto {
  static readonly zodSchema = z
    .object({
      stages: z
        .array(stage)
        .min(1)
        .max(20)
        .refine(
          (values) =>
            new Set(values.map((value) => value.id)).size === values.length,
          'Duplicate stage identifiers',
        ),
    })
    .strict();
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) stages: {
    id: string;
    label: string;
  }[];
}
export class MoveInterestedPipelineDto {
  static readonly zodSchema = z.object({ stageId: stage.shape.id }).strict();
  @IsString() @Matches(/^[a-z][a-z\d_]{0,39}$/) stageId: string;
}
