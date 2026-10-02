import { ApiProperty } from '@nestjs/swagger';
import { Owner } from '../entities/owner.entity';

export class OwnerPageDto {
  @ApiProperty({ type: [Owner] })
  data: Owner[];

  @ApiProperty({ type: 'integer', minimum: 0 })
  total: number;

  @ApiProperty({ type: 'integer', minimum: 1 })
  page: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100 })
  limit: number;
}
