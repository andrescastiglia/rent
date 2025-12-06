import * as puppeteer from 'puppeteer';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
            const html = this.renderMonthlySummaryTemplate(data);
            const filename = `monthly_summary_${ownerId}_${year}_${month}.pdf`;
            const pdfPath = await this.generatePdf(html, filename);

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
            const html = this.renderSettlementTemplate(data);
            const filename = `settlement_${ownerId}_${period}.pdf`;
            const pdfPath = await this.generatePdf(html, filename);

            return { success: true, pdfPath };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to generate settlement', { ownerId, error: errorMsg });
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Generates PDF from HTML using Puppeteer.
     */
    private async generatePdf(html: string, filename: string): Promise<string> {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });

            const pdfPath = path.join(this.outputDir, filename);
            await page.pdf({
                path: pdfPath,
                format: 'A4',
                margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
                printBackground: true,
            });

            logger.info('PDF generated', { pdfPath });
            return pdfPath;
        } finally {
            await browser.close();
        }
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

    /**
     * Renders monthly summary template.
     */
    private renderMonthlySummaryTemplate(data: MonthlySummaryData): string {
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #2563eb; margin: 0; }
        .header p { color: #6b7280; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f3f4f6; font-weight: bold; }
        .text-right { text-align: right; }
        .totals { background: #eff6ff; }
        .totals td { font-weight: bold; }
        .status { padding: 2px 8px; border-radius: 4px; font-size: 11px; }
        .status-paid { background: #d1fae5; color: #065f46; }
        .status-pending { background: #fef3c7; color: #92400e; }
        .status-overdue { background: #fee2e2; color: #991b1b; }
        .amount { font-family: monospace; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Resumen Mensual</h1>
        <p>${monthNames[data.month - 1]} ${data.year}</p>
        <p><strong>${data.ownerName}</strong></p>
    </div>

    <table>
        <thead>
            <tr>
                <th>Factura</th>
                <th>Inquilino</th>
                <th>Propiedad</th>
                <th class="text-right">Subtotal</th>
                <th class="text-right">Ret.</th>
                <th class="text-right">Total</th>
                <th>Estado</th>
            </tr>
        </thead>
        <tbody>
            ${data.invoices.map(inv => `
            <tr>
                <td>${inv.invoiceNumber}</td>
                <td>${inv.tenantName}</td>
                <td>${inv.propertyAddress}</td>
                <td class="text-right amount">$${inv.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                <td class="text-right amount">$${inv.withholdings.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                <td class="text-right amount">$${inv.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                <td><span class="status status-${inv.status}">${inv.status}</span></td>
            </tr>
            `).join('')}
            <tr class="totals">
                <td colspan="3"><strong>TOTALES</strong></td>
                <td class="text-right amount">$${data.totals.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                <td class="text-right amount">$${data.totals.withholdings.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                <td class="text-right amount">$${data.totals.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                <td></td>
            </tr>
        </tbody>
    </table>

    <p><strong>Cobrado:</strong> $${data.totals.paid.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
    <p><strong>Pendiente:</strong> $${data.totals.pending.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
</body>
</html>`;
    }

    /**
     * Renders settlement template.
     */
    private renderSettlementTemplate(data: SettlementData): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
        .header h1 { color: #2563eb; margin: 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f3f4f6; }
        .text-right { text-align: right; }
        .summary { margin-top: 30px; padding: 20px; background: #f9fafb; border-radius: 8px; }
        .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
        .summary-total { font-size: 18px; font-weight: bold; color: #2563eb; border-top: 2px solid #2563eb; margin-top: 10px; padding-top: 10px; }
        .amount { font-family: monospace; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Liquidación</h1>
        <p>Período: ${data.period}</p>
        <p><strong>${data.ownerName}</strong></p>
        ${data.ownerCuit ? `<p>CUIT: ${data.ownerCuit}</p>` : ''}
    </div>

    <h3>Detalle de Cobros</h3>
    <table>
        <thead>
            <tr>
                <th>Factura</th>
                <th>Inquilino</th>
                <th>Propiedad</th>
                <th class="text-right">Monto</th>
            </tr>
        </thead>
        <tbody>
            ${data.invoices.map(inv => `
            <tr>
                <td>${inv.invoiceNumber}</td>
                <td>${inv.tenant}</td>
                <td>${inv.property}</td>
                <td class="text-right amount">$${inv.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>

    <div class="summary">
        <div class="summary-row">
            <span>Total Bruto:</span>
            <span class="amount">$${data.summary.grossAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
        </div>
        ${data.deductions.map(d => `
        <div class="summary-row">
            <span>${d.description}:</span>
            <span class="amount">-$${d.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
        </div>
        `).join('')}
        <div class="summary-row summary-total">
            <span>NETO A DEPOSITAR:</span>
            <span class="amount">$${data.summary.netAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
        </div>
    </div>
</body>
</html>`;
    }
}
