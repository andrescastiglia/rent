import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { CreateInvoiceDto, GenerateInvoiceDto } from './dto';
import { InvoiceFiltersDto } from './dto/invoice-filters.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DocumentsService } from '../documents/documents.service';
import { PaymentsService } from './payments.service';

/**
 * Controlador para gestión de facturas.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly invoicePdfService: InvoicePdfService,
    private readonly documentsService: DocumentsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Crea una nueva factura.
   */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(dto);
  }

  /**
   * Genera factura mensual para un contrato con fechas automáticas.
   */
  @Post('lease/:leaseId/generate')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  generateForLease(
    @Param('leaseId') leaseId: string,
    @Body() dto: GenerateInvoiceDto,
  ) {
    return this.invoicesService.generateForLease(leaseId, dto);
  }

  /**
   * Emite una factura (genera PDF y registra en cuenta).
   */
  @Patch(':id/issue')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async issue(@Param('id') id: string) {
    const invoice = await this.invoicesService.issue(id);

    try {
      const pdfUrl = await this.invoicePdfService.generate(invoice);
      return this.invoicesService.attachPdf(invoice.id, pdfUrl);
    } catch (error) {
      console.error('Failed to generate invoice PDF:', error);
    }

    return invoice;
  }

  /**
   * Lista facturas con filtros.
   */
  @Get()
  findAll(@Query() filters: InvoiceFiltersDto, @Request() req?: any) {
    return this.invoicesService.findAll(
      {
        leaseId: filters.leaseId,
        ownerId: filters.ownerId,
        status: filters.status,
        page: filters.page ?? 1,
        limit: filters.limit ?? 10,
      },
      req?.user,
    );
  }

  /**
   * Obtiene una factura por ID.
   */
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.invoicesService.findOneScoped(id, req.user);
  }

  /**
   * Lista notas de crédito de una factura.
   */
  @Get(':id/credit-notes')
  async listCreditNotes(@Param('id') id: string, @Request() req: any) {
    await this.invoicesService.findOneScoped(id, req.user);
    return this.paymentsService.listCreditNotesByInvoice(id);
  }

  /**
   * Cancela una factura.
   */
  @Patch(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  cancel(@Param('id') id: string) {
    return this.invoicesService.cancel(id);
  }

  /**
   * Descarga el PDF de una factura.
   */
  @Get(':id/pdf')
  async getPdf(
    @Param('id') id: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const invoice = await this.invoicesService.findOneScoped(id, req.user);

    if (!invoice.pdfUrl) {
      return res.status(404).json({ message: 'PDF not found' });
    }

    const { buffer, contentType } = await this.documentsService.downloadByS3Key(
      invoice.pdfUrl,
    );

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="factura-${invoice.invoiceNumber}.pdf"`,
    });

    return res.send(buffer);
  }

  /**
   * Descarga PDF de nota de crédito.
   */
  @Get('credit-notes/:creditNoteId/pdf')
  async getCreditNotePdf(
    @Param('creditNoteId') creditNoteId: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const note = await this.paymentsService.findCreditNoteById(creditNoteId);
    await this.invoicesService.findOneScoped(note.invoiceId, req.user);

    if (!note.pdfUrl) {
      return res.status(404).json({ message: 'Credit note PDF not found' });
    }

    const { buffer, contentType } = await this.documentsService.downloadByS3Key(
      note.pdfUrl,
    );

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="nota-credito-${note.noteNumber}.pdf"`,
    });

    return res.send(buffer);
  }
}
