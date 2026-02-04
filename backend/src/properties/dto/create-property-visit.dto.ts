import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePropertyVisitDto {
  @IsDateString()
  @IsOptional()
  visitedAt?: string;

  @IsString()
  @IsNotEmpty()
  interestedName: string;

  @IsString()
  @IsOptional()
  comments?: string;

  @IsBoolean()
  @IsOptional()
  hasOffer?: boolean;

  @IsNumber()
  @IsOptional()
  offerAmount?: number;

  @IsString()
  @IsOptional()
  offerCurrency?: string;
}
