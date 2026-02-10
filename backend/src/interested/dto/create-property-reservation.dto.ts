import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePropertyReservationDto {
  @IsUUID()
  propertyId: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  activitySource?: string;
}
