import { Controller, Get, Param, UseGuards, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { PdfService } from './pdf.service';
import { DocumentsService } from '../documents/documents.service';

@Controller('leases')
@UseGuards(AuthGuard('jwt'))
export class LeasesContractController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly documentsService: DocumentsService,
  ) {}

  @Get(':id/contract')
  async downloadContract(@Param('id') id: string, @Res() res: Response) {
    const document = await this.pdfService.getContractDocument(id);

    if (!document) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    // Generate download URL
    const { downloadUrl } = await this.documentsService.generateDownloadUrl(document.id);

    // Redirect to S3 pre-signed URL
    return res.redirect(downloadUrl);
  }
}
