import {
  Controller,
  Get,
  Param,
  UseGuards,
  Res,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { PdfService } from './pdf.service';
import { DocumentsService } from '../documents/documents.service';
import { LeasesService } from './leases.service';
import { UserRole } from '../users/entities/user.entity';

interface AuthenticatedRequest {
  user: {
    id: string;
    role: UserRole;
    email?: string | null;
    phone?: string | null;
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller('leases')
export class LeasesContractController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly documentsService: DocumentsService,
    private readonly leasesService: LeasesService,
  ) {}

  @Get(':id/contract')
  async downloadContract(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    await this.leasesService.findOneScoped(id, req.user);
    const document = await this.pdfService.getContractDocument(id);

    if (!document) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    const { buffer, contentType } = await this.documentsService.downloadByS3Key(
      document.fileUrl,
    );

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${document.name || `contrato-${id}.pdf`}"`, // NOSONAR
    });

    return res.send(buffer);
  }
}
