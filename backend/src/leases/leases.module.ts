import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lease } from './entities/lease.entity';
import { LeaseAmendment } from './entities/lease-amendment.entity';
import { LeaseContractTemplate } from './entities/lease-contract-template.entity';
import { Property } from '../properties/entities/property.entity';
import { Document } from '../documents/entities/document.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { InterestedProfile } from '../interested/entities/interested-profile.entity';
import { LeasesService } from './leases.service';
import { AmendmentsService } from './amendments.service';
import { PdfService } from './pdf.service';
import { LeasesController } from './leases.controller';
import { AmendmentsController } from './amendments.controller';
import { LeasesContractController } from './leases-contract.controller';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lease,
      LeaseAmendment,
      LeaseContractTemplate,
      Property,
      InterestedProfile,
      Document,
      Tenant,
    ]),
    DocumentsModule,
  ],
  controllers: [
    LeasesController,
    AmendmentsController,
    LeasesContractController,
  ],
  providers: [LeasesService, AmendmentsService, PdfService],
  exports: [TypeOrmModule, LeasesService, AmendmentsService, PdfService],
})
export class LeasesModule {}
