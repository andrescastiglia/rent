import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Body,
    Query,
    UseGuards,
    Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { CreateInvoiceDto } from './dto';
import { InvoiceStatus } from './entities/invoice.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DocumentsService } from '../documents/documents.service';

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
    ) { }

    /**
     * Crea una nueva factura.
     */
    @Post()
    @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
    create(@Body() dto: CreateInvoiceDto) {
        return this.invoicesService.create(dto);
    }

    /**
     * Emite una factura (genera PDF y registra en cuenta).
     */
    @Patch(':id/issue')
    @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
    async issue(@Param('id') id: string) {
        const invoice = await this.invoicesService.issue(id);

        // Generar PDF
        try {
            const pdfUrl = await this.invoicePdfService.generate(invoice);
            invoice.pdfUrl = pdfUrl;
        } catch (error) {
            console.error('Failed to generate invoice PDF:', error);
        }

        return invoice;
    }

    /**
     * Lista facturas con filtros.
     */
    @Get()
    findAll(
        @Query('leaseId') leaseId?: string,
        @Query('ownerId') ownerId?: string,
        @Query('status') status?: InvoiceStatus,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.invoicesService.findAll({
            leaseId,
            ownerId,
            status,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 10,
        });
    }

    /**
     * Obtiene una factura por ID.
     */
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.invoicesService.findOne(id);
    }

    /**
     * Cancela una factura.
     */
    @Patch(':id/cancel')
    @Roles(UserRole.ADMIN, UserRole.OWNER)
    cancel(@Param('id') id: string) {
        return this.invoicesService.cancel(id);
    }

    /**
     * Descarga el PDF de una factura.
     */
    @Get(':id/pdf')
    async getPdf(@Param('id') id: string, @Res() res: Response) {
        const invoice = await this.invoicesService.findOne(id);

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
}
