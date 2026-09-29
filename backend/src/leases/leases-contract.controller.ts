import { ApiOkResponse } from '@nestjs/swagger';
import { LeaseContractStatusDto } from './dto/lease-contract-status.dto';
import {
  Controller,
  Get,
  Param,
  UseGuards,
  Res,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { Response } from 'express';
import { PdfService } from './pdf.service';
import { DocumentsService } from '../documents/documents.service';
import { LeasesService } from './leases.service';
import { UserRole } from '../users/entities/user.entity';

interface AuthenticatedRequest {
  user: {
    id: string;
    companyId: string;
    role: UserRole;
    roles?: UserRole[];
    email?: string | null;
    phone?: string | null;
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller(['contracts', 'leases'])
@Authenticated('leases')
export class LeasesContractController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly documentsService: DocumentsService,
    private readonly leasesService: LeasesService,
  ) {}

  @Get(':id/contract-status')
  @ApiOkResponse({ type: LeaseContractStatusDto })
  async status(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.leasesService.findOneScoped(id, req.user);
    return this.pdfService.getContractStatus(id, req.user.companyId);
  }

  @Get(':id/contract')
  async downloadContract(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    await this.leasesService.findOneScoped(id, req.user);
    const document = await this.pdfService.getContractDocument(
      id,
      req.user.companyId,
    );

    if (!document) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    const { buffer, contentType } =
      await this.documentsService.downloadByFileUrl(document.fileUrl, {
        companyId: req.user.companyId,
        entityType: 'lease',
        entityId: id,
      });

    const filename = document.name || `contrato-${id}.pdf`;
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return res.send(buffer);
  }
}
