import { IsString } from 'class-validator';

export class UpdateLeaseDraftTextDto {
  @IsString()
  draftText: string;
}
