import { Controller, Get, Param, UseGuards, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { PdfService } from './pdf.service';
import { DocumentsService } from '../documents/documents.service';

@UseGuards(AuthGuard('jwt'))
@Controller('leases')
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

    const { buffer, contentType } = await this.documentsService.downloadByS3Key(
      document.fileUrl,
    );

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${document.name || `contrato-${id}.pdf`}"`,
    });

    return res.send(buffer);
  }
}
