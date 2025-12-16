import * as fs from 'node:fs';
import * as path from 'node:path';
import PDFDocument from 'pdfkit';
import { AppDataSource } from '../shared/database';
import { logger } from '../shared/logger';

/**
 * Report type.
 */
export type ReportType = 'monthly_summary' | 'settlement';

/**
 * Monthly summary data.
 */
export interface MonthlySummaryData {
    ownerId: string;
    ownerName: string;
    month: number;
    year: number;
    invoices: Array<{
        invoiceNumber: string;
        tenantName: string;
        propertyAddress: string;
        subtotal: number;
        withholdings: number;
        total: number;
        status: string;
    }>;
    totals: {
        subtotal: number;
        withholdings: number;
        total: number;
        paid: number;
        pending: number;
    };
}

/**
 * Settlement data.
 */
export interface SettlementData {
    ownerId: string;
    ownerName: string;
    ownerCuit?: string;
    period: string;
    invoices: Array<{
        invoiceNumber: string;
        tenant: string;
        property: string;
        amount: number;
    }>;
    deductions: Array<{
        description: string;
        amount: number;
    }>;
    summary: {
        grossAmount: number;
        totalDeductions: number;
        netAmount: number;
    };
}

/**
 * Report generation result.
 */
export interface ReportResult {
    success: boolean;
    pdfPath?: string;
    pdfBuffer?: Buffer;
    error?: string;
}

/**
 * Service for generating PDF reports.
 */
export class ReportService {
    private readonly outputDir: string;

    /**
     * Creates an instance of ReportService.
     */
    constructor() {
        this.outputDir = process.env.REPORTS_OUTPUT_DIR || './reports';
        this.ensureOutputDir();
    }

    /**
     * Ensures the output directory exists.
     */
    private ensureOutputDir(): void {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Generates a monthly summary report for an owner.
     *
     * @param ownerId - Owner ID.
     * @param year - Year.
     * @param month - Month (1-12).
     * @returns Report result with PDF path.
     */
    async generateMonthlySummary(
        ownerId: string,
        year: number,
        month: number
    ): Promise<ReportResult> {
        logger.info('Generating monthly summary', { ownerId, year, month });

        try {
            const data = await this.fetchMonthlySummaryData(ownerId, year, month);
            const filename = `monthly_summary_${ownerId}_${year}_${month}.pdf`;
            const pdfPath = await this.generateMonthlySummaryPdf(data, filename);

            return { success: true, pdfPath };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to generate monthly summary', { ownerId, error: errorMsg });
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Generates a settlement report for an owner.
     *
     * @param ownerId - Owner ID.
     * @param period - Period string (e.g., "2025-12").
     * @returns Report result with PDF path.
     */
    async generateSettlement(
        ownerId: string,
        period: string
    ): Promise<ReportResult> {
        logger.info('Generating settlement', { ownerId, period });

        try {
            const data = await this.fetchSettlementData(ownerId, period);
            const filename = `settlement_${ownerId}_${period}.pdf`;
            const pdfPath = await this.generateSettlementPdf(data, filename);

            return { success: true, pdfPath };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to generate settlement', { ownerId, error: errorMsg });
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Generates PDF for a monthly summary.
     */
    private async generateMonthlySummaryPdf(
        data: MonthlySummaryData,
        filename: string
    ): Promise<string> {
        const pdfPath = path.join(this.outputDir, filename);
        await this.writePdf(pdfPath, (doc) => {
            const monthNames = [
                'Enero',
                'Febrero',
                'Marzo',
                'Abril',
                'Mayo',
                'Junio',
                'Julio',
                'Agosto',
                'Septiembre',
                'Octubre',
                'Noviembre',
                'Diciembre',
            ];

            doc.fontSize(18).text('Resumen Mensual', { align: 'center' });
            doc.moveDown(0.25);
            doc.fontSize(12).text(`${monthNames[data.month - 1]} ${data.year}`, {
                align: 'center',
            });
            doc.moveDown(0.25);
            doc.fontSize(12).text(data.ownerName, { align: 'center' });
            doc.moveDown();

            const tableTop = doc.y;
            const left = doc.page.margins.left;
            const right = doc.page.width - doc.page.margins.right;
            const rowHeight = 16;

            const columns = {
                invoice: left,
                tenant: left + 70,
                property: left + 190,
                subtotal: right - 220,
                withholdings: right - 160,
                total: right - 100,
                status: right - 40,
            };

            const drawHeader = () => {
                doc.fontSize(9).font('Helvetica-Bold');
                doc.text('Factura', columns.invoice, doc.y, { width: 70 });
                doc.text('Inquilino', columns.tenant, doc.y, { width: 120 });
                doc.text('Propiedad', columns.property, doc.y, { width: 180 });
                doc.text('Subtotal', columns.subtotal, doc.y, { width: 60, align: 'right' });
                doc.text('Ret.', columns.withholdings, doc.y, { width: 60, align: 'right' });
                doc.text('Total', columns.total, doc.y, { width: 60, align: 'right' });
                doc.text('Est.', columns.status, doc.y, { width: 40, align: 'right' });
                doc.moveDown(0.5);
                doc
                    .moveTo(left, doc.y)
                    .lineTo(right, doc.y)
                    .strokeColor('#CCCCCC')
                    .stroke();
                doc.moveDown(0.25);
                doc.font('Helvetica');
            };

            const ensureSpace = () => {
                if (doc.y + rowHeight * 2 > doc.page.height - doc.page.margins.bottom) {
                    doc.addPage();
                    drawHeader();
                }
            };

            const truncate = (value: string, max: number) =>
                value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;

            doc.y = tableTop;
            drawHeader();

            for (const inv of data.invoices) {
                ensureSpace();
                const y = doc.y;
                doc.fontSize(9);
                doc.text(truncate(inv.invoiceNumber, 14), columns.invoice, y, {
                    width: 70,
                });
                doc.text(truncate(inv.tenantName, 22), columns.tenant, y, {
                    width: 120,
                });
                doc.text(truncate(inv.propertyAddress, 34), columns.property, y, {
                    width: 180,
                });
                doc.text(this.formatCurrency(inv.subtotal), columns.subtotal, y, {
                    width: 60,
                    align: 'right',
                });
                doc.text(this.formatCurrency(inv.withholdings), columns.withholdings, y, {
                    width: 60,
                    align: 'right',
                });
                doc.text(this.formatCurrency(inv.total), columns.total, y, {
                    width: 60,
                    align: 'right',
                });
                doc.text(truncate(inv.status, 8), columns.status, y, {
                    width: 40,
                    align: 'right',
                });
                doc.y = y + rowHeight;
            }

            doc.moveDown(0.5);
            doc
                .moveTo(left, doc.y)
                .lineTo(right, doc.y)
                .strokeColor('#CCCCCC')
                .stroke();
            doc.moveDown();

            doc.font('Helvetica-Bold');
            doc.text(`Totales`, left, doc.y);
            doc.font('Helvetica');
            doc.text(`Subtotal: ${this.formatCurrency(data.totals.subtotal)}`);
            doc.text(`Retenciones: ${this.formatCurrency(data.totals.withholdings)}`);
            doc.text(`Total: ${this.formatCurrency(data.totals.total)}`);
            doc.moveDown(0.25);
            doc.text(`Cobrado: ${this.formatCurrency(data.totals.paid)}`);
            doc.text(`Pendiente: ${this.formatCurrency(data.totals.pending)}`);
        });

        logger.info('PDF generated', { pdfPath });
        return pdfPath;
    }

    /**
     * Generates PDF for a settlement.
     */
    private async generateSettlementPdf(
        data: SettlementData,
        filename: string
    ): Promise<string> {
        const pdfPath = path.join(this.outputDir, filename);
        await this.writePdf(pdfPath, (doc) => {
            doc.fontSize(18).text('Liquidación', { align: 'center' });
            doc.moveDown(0.25);
            doc.fontSize(12).text(`Período: ${data.period}`, { align: 'center' });
            doc.moveDown(0.25);
            doc.fontSize(12).text(data.ownerName, { align: 'center' });
            if (data.ownerCuit) {
                doc.fontSize(10).text(`CUIT: ${data.ownerCuit}`, { align: 'center' });
            }
            doc.moveDown();

            const left = doc.page.margins.left;
            const right = doc.page.width - doc.page.margins.right;
            const rowHeight = 16;

            doc.fontSize(12).font('Helvetica-Bold').text('Detalle de Cobros');
            doc.font('Helvetica');
            doc.moveDown(0.5);

            const columns = {
                invoice: left,
                tenant: left + 80,
                property: left + 210,
                amount: right - 80,
            };

            const drawHeader = () => {
                doc.fontSize(9).font('Helvetica-Bold');
                doc.text('Factura', columns.invoice, doc.y, { width: 80 });
                doc.text('Inquilino', columns.tenant, doc.y, { width: 130 });
                doc.text('Propiedad', columns.property, doc.y, { width: 220 });
                doc.text('Monto', columns.amount, doc.y, { width: 80, align: 'right' });
                doc.moveDown(0.5);
                doc
                    .moveTo(left, doc.y)
                    .lineTo(right, doc.y)
                    .strokeColor('#CCCCCC')
                    .stroke();
                doc.moveDown(0.25);
                doc.font('Helvetica');
            };

            const ensureSpace = () => {
                if (doc.y + rowHeight * 2 > doc.page.height - doc.page.margins.bottom) {
                    doc.addPage();
                    drawHeader();
                }
            };

            const truncate = (value: string, max: number) =>
                value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;

            drawHeader();
            for (const inv of data.invoices) {
                ensureSpace();
                const y = doc.y;
                doc.fontSize(9);
                doc.text(truncate(inv.invoiceNumber, 16), columns.invoice, y, { width: 80 });
                doc.text(truncate(inv.tenant, 24), columns.tenant, y, { width: 130 });
                doc.text(truncate(inv.property, 40), columns.property, y, { width: 220 });
                doc.text(this.formatCurrency(inv.amount), columns.amount, y, {
                    width: 80,
                    align: 'right',
                });
                doc.y = y + rowHeight;
            }

            doc.moveDown();
            doc.font('Helvetica-Bold').text('Deducciones');
            doc.font('Helvetica');
            for (const d of data.deductions) {
                doc.text(`${d.description}: -${this.formatCurrency(d.amount)}`);
            }
            doc.moveDown(0.5);
            doc
                .moveTo(left, doc.y)
                .lineTo(right, doc.y)
                .strokeColor('#CCCCCC')
                .stroke();
            doc.moveDown(0.5);

            doc.font('Helvetica-Bold');
            doc.text(`Total Bruto: ${this.formatCurrency(data.summary.grossAmount)}`);
            doc.text(`Total Deducciones: ${this.formatCurrency(data.summary.totalDeductions)}`);
            doc.text(`Neto a Depositar: ${this.formatCurrency(data.summary.netAmount)}`);
            doc.font('Helvetica');
        });

        logger.info('PDF generated', { pdfPath });
        return pdfPath;
    }

    private async writePdf(
        pdfPath: string,
        render: (doc: InstanceType<typeof PDFDocument>) => void
    ): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margin: 50,
                autoFirstPage: true,
            });

            const stream = fs.createWriteStream(pdfPath);
            stream.on('finish', () => resolve());
            stream.on('error', (e) => reject(e));

            doc.pipe(stream);
            try {
                render(doc);
                doc.end();
            } catch (e) {
                reject(e);
            }
        });
    }

    private formatCurrency(value: number): string {
        return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    }

    /**
     * Fetches monthly summary data from database.
     */
    private async fetchMonthlySummaryData(
        ownerId: string,
        year: number,
        month: number
    ): Promise<MonthlySummaryData> {
        const ownerResult = await AppDataSource.query(
            `SELECT u.first_name, u.last_name FROM users u
             JOIN owners o ON o.user_id = u.id
             WHERE o.user_id = $1`,
            [ownerId]
        );

        const ownerName = ownerResult.length > 0
            ? `${ownerResult[0].first_name} ${ownerResult[0].last_name}`
            : 'Propietario';

        const invoicesResult = await AppDataSource.query(
            `SELECT 
                i.invoice_number as "invoiceNumber",
                CONCAT(tu.first_name, ' ', tu.last_name) as "tenantName",
                CONCAT(p.address, ' - ', un.unit_number) as "propertyAddress",
                i.subtotal,
                i.withholdings_total as withholdings,
                i.total,
                i.status,
                i.amount_paid as "amountPaid"
             FROM invoices i
             JOIN leases l ON l.id = i.lease_id
             JOIN units un ON un.id = l.unit_id
             JOIN properties p ON p.id = un.property_id
             JOIN tenant_accounts ta ON ta.id = i.tenant_account_id
             JOIN tenants t ON t.user_id = ta.tenant_id
             JOIN users tu ON tu.id = t.user_id
             WHERE i.owner_id = $1
               AND EXTRACT(YEAR FROM i.period_start) = $2
               AND EXTRACT(MONTH FROM i.period_start) = $3
               AND i.deleted_at IS NULL
             ORDER BY i.created_at`,
            [ownerId, year, month]
        );

        const invoices: Array<{
            invoiceNumber: string;
            tenantName: string;
            propertyAddress: string;
            subtotal: number;
            withholdings: number;
            total: number;
            status: string;
            amountPaid: number;
        }> = invoicesResult.map((row: Record<string, unknown>) => ({
            invoiceNumber: row.invoiceNumber as string,
            tenantName: row.tenantName as string,
            propertyAddress: row.propertyAddress as string,
            subtotal: Number.parseFloat(row.subtotal as string),
            withholdings: Number.parseFloat(row.withholdings as string),
            total: Number.parseFloat(row.total as string),
            status: row.status as string,
            amountPaid: Number.parseFloat(row.amountPaid as string),
        }));

        const totals = {
            subtotal: invoices.reduce((sum: number, i) => sum + i.subtotal, 0),
            withholdings: invoices.reduce((sum: number, i) => sum + i.withholdings, 0),
            total: invoices.reduce((sum: number, i) => sum + i.total, 0),
            paid: invoices.filter(i => i.status === 'paid').reduce((sum: number, i) => sum + i.total, 0),
            pending: invoices.filter(i => i.status !== 'paid').reduce((sum: number, i) => sum + i.total, 0),
        };

        return { ownerId, ownerName, month, year, invoices, totals };
    }

    /**
     * Fetches settlement data from database.
     */
    private async fetchSettlementData(
        ownerId: string,
        period: string
    ): Promise<SettlementData> {
        const [year, month] = period.split('-').map(Number);

        const ownerResult = await AppDataSource.query(
            `SELECT u.first_name, u.last_name, o.cuit 
             FROM users u
             JOIN owners o ON o.user_id = u.id
             WHERE o.user_id = $1`,
            [ownerId]
        );

        const ownerName = ownerResult.length > 0
            ? `${ownerResult[0].first_name} ${ownerResult[0].last_name}`
            : 'Propietario';
        const ownerCuit = ownerResult[0]?.cuit;

        const invoicesResult = await AppDataSource.query(
            `SELECT 
                i.invoice_number,
                CONCAT(tu.first_name, ' ', tu.last_name) as tenant,
                CONCAT(p.address, ' - ', un.unit_number) as property,
                i.total as amount
             FROM invoices i
             JOIN leases l ON l.id = i.lease_id
             JOIN units un ON un.id = l.unit_id
             JOIN properties p ON p.id = un.property_id
             JOIN tenant_accounts ta ON ta.id = i.tenant_account_id
             JOIN tenants t ON t.user_id = ta.tenant_id
             JOIN users tu ON tu.id = t.user_id
             WHERE i.owner_id = $1
               AND EXTRACT(YEAR FROM i.period_start) = $2
               AND EXTRACT(MONTH FROM i.period_start) = $3
               AND i.status = 'paid'
               AND i.deleted_at IS NULL`,
            [ownerId, year, month]
        );

        const invoices: Array<{
            invoiceNumber: string;
            tenant: string;
            property: string;
            amount: number;
        }> = invoicesResult.map((row: Record<string, unknown>) => ({
            invoiceNumber: row.invoice_number as string,
            tenant: row.tenant as string,
            property: row.property as string,
            amount: Number.parseFloat(row.amount as string),
        }));

        const grossAmount = invoices.reduce((sum: number, i) => sum + i.amount, 0);
        const commission = grossAmount * 0.05; // 5% commission

        const deductions = [
            { description: 'Comisión de administración (5%)', amount: commission },
        ];

        const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);

        return {
            ownerId,
            ownerName,
            ownerCuit,
            period,
            invoices,
            deductions,
            summary: {
                grossAmount,
                totalDeductions,
                netAmount: grossAmount - totalDeductions,
            },
        };
    }

}
