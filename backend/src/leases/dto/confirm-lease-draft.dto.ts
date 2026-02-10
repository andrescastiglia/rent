import { IsOptional, IsString } from 'class-validator';

export class ConfirmLeaseDraftDto {
  @IsString()
  @IsOptional()
  finalText?: string;
}
