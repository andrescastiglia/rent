import { IsOptional, IsString } from 'class-validator';

export class WebhookEventDto {
  @IsString()
  envelopeId: string;

  @IsString()
  status: string;

  @IsString()
  signerEmail: string;

  @IsOptional()
  @IsString()
  completedAt?: string;
}
