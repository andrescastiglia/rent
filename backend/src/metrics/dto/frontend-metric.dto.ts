import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class FrontendMetricDto {
  @IsIn(['web_vital', 'client_error', 'api_error'])
  type: 'web_vital' | 'client_error' | 'api_error';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  name?: string;

  @IsOptional()
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  endpoint?: string;

  @IsOptional()
  @IsNumber()
  statusCode?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  errorType?: string;
}
