import { IsOptional, IsUUID } from 'class-validator';

export class RenderLeaseDraftDto {
  @IsUUID()
  @IsOptional()
  templateId?: string;
}
