import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class WebhookEventDto {
  @IsString()
  @MaxLength(255)
  envelopeId: string;

  @IsString()
  @IsIn(['completed', 'voided', 'declined', 'expired'])
  status: string;

  @IsOptional()
  @IsEmail()
  @IsString()
  signerEmail?: string;

  @IsOptional()
  @IsISO8601()
  @IsString()
  completedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  eventId?: string;

  @IsISO8601()
  @IsString()
  generatedAt: string;
}
