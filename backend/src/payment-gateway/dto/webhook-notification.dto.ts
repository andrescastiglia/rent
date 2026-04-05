import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WebhookDataDto {
  @IsString()
  id: string;
}

export class WebhookNotificationDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @ValidateNested()
  @Type(() => WebhookDataDto)
  data: WebhookDataDto;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  date_created?: string;
}
