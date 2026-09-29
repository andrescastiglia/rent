import { ApiProperty } from '@nestjs/swagger';
export class LeaseContractStatusDto {
  @ApiProperty({ enum: ['queued', 'completed', 'dead_letter', 'unavailable'] })
  status: 'queued' | 'completed' | 'dead_letter' | 'unavailable';
  available: boolean;
}
