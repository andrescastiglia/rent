import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendWhatsappMessageDto {
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  to: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text: string;

  @IsOptional()
  @IsString()
  @Matches(/^db:\/\/document\/[0-9a-fA-F-]+$/)
  @MaxLength(200)
  pdfUrl?: string;
}
