import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TenantFiltersDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  dni?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;
}
