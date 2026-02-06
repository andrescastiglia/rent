import { IsEnum, IsOptional, IsString } from 'class-validator';
import { InterestedStatus } from '../entities/interested-profile.entity';

export class ChangeInterestedStageDto {
  @IsEnum(InterestedStatus)
  toStatus: InterestedStatus;

  @IsString()
  @IsOptional()
  reason?: string;
}
