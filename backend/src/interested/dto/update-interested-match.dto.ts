import { IsEnum, IsOptional, IsString } from 'class-validator';
import { InterestedMatchStatus } from '../entities/interested-property-match.entity';

export class UpdateInterestedMatchDto {
  @IsEnum(InterestedMatchStatus)
  status: InterestedMatchStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
