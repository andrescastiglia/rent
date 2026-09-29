import { ApiProperty } from '@nestjs/swagger';

export class PortalOperationDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['publish', 'update', 'pause', 'remove', 'refresh'] })
  operation: 'publish' | 'update' | 'pause' | 'remove' | 'refresh';

  @ApiProperty({
    enum: [
      'queued',
      'dispatching',
      'retry',
      'completed',
      'failed',
      'needs_review',
      'resolved',
    ],
  })
  status:
    | 'queued'
    | 'dispatching'
    | 'retry'
    | 'completed'
    | 'failed'
    | 'needs_review'
    | 'resolved';

  @ApiProperty()
  attempts: number;

  @ApiProperty({ type: String, nullable: true })
  errorCode: string | null;

  @ApiProperty()
  updatedAt: Date;
}

export class PortalOperationOverviewDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ type: PortalOperationDto, nullable: true })
  job: PortalOperationDto | null;
}
