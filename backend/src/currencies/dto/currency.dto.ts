import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Length,
  Min,
  Max,
} from 'class-validator';

export class CreateCurrencyDto {
  @IsString()
  @Length(3, 3)
  code: string;

  @IsString()
  @Length(1, 5)
  symbol: string;

  @IsNumber()
  @Min(0)
  @Max(4)
  @IsOptional()
  decimalPlaces?: number = 2;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class UpdateCurrencyDto {
  @IsString()
  @Length(1, 5)
  @IsOptional()
  symbol?: string;

  @IsNumber()
  @Min(0)
  @Max(4)
  @IsOptional()
  decimalPlaces?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CurrencyResponseDto {
  code: string;
  symbol: string;
  decimalPlaces: number;
  isActive: boolean;
}
