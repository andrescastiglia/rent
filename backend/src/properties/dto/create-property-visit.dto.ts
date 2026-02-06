import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreatePropertyVisitDto {
  @IsDateString()
  @IsOptional()
  visitedAt?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  interestedName?: string;

  @IsUUID()
  @IsOptional()
  interestedProfileId?: string;

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
