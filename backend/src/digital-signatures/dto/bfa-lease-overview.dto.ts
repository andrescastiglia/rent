import { ApiProperty } from '@nestjs/swagger';

export class BfaBlockProofDto {
  @ApiProperty()
  whostamped: string;

  @ApiProperty()
  blocknumber: string;

  @ApiProperty()
  blocktimestamp: number;
}

export class BfaProofDto {
  @ApiProperty()
  stamped: boolean;

  @ApiProperty({ type: [BfaBlockProofDto] })
  stamps: BfaBlockProofDto[];
}

export class BfaDocumentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true })
  sha256: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['queued', 'submitted', 'stamped', 'failed', 'needs_review', null],
  })
  status: 'queued' | 'submitted' | 'stamped' | 'failed' | 'needs_review' | null;

  @ApiProperty()
  currentVersion: boolean;

  @ApiProperty({ type: Date, nullable: true })
  verifiedAt: Date | null;

  @ApiProperty({ type: BfaProofDto, nullable: true })
  proof: BfaProofDto | null;
}

export class BfaLeaseOverviewDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ type: [BfaDocumentDto] })
  documents: BfaDocumentDto[];
}
