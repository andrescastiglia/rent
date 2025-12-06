import sgMail, { MailDataRequired } from '@sendgrid/mail';
import { logger } from '../shared/logger';
import { InvoiceRecord } from './invoice.service';

/**
 * Email template types.
 */
export type EmailTemplate =
    | 'invoice_issued'
    | 'payment_reminder'
    | 'overdue_notice';

/**
 * Email recipient data.
 */
export interface EmailRecipient {
    email: string;
    name?: string;
}

/**
 * Invoice email data.
 */
export interface InvoiceEmailData {
    invoice: InvoiceRecord;
    tenant: EmailRecipient;
    owner: EmailRecipient;
    pdfUrl?: string;
}

/**
 * Reminder email data.
 */
export interface ReminderEmailData {
    invoice: InvoiceRecord;
    tenant: EmailRecipient;
    daysUntilDue: number;
}

/**
 * Overdue notice data.
 */
export interface OverdueEmailData {
    invoice: InvoiceRecord;
    tenant: EmailRecipient;
    daysOverdue: number;
    lateFee: number;
}

/**
 * Email send result.
 */
export interface EmailSendResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Service for sending email notifications via SendGrid.
 */
export class EmailService {
    private readonly fromEmail: string;
    private readonly fromName: string;
    private readonly enabled: boolean;

    /**
     * Creates an instance of EmailService.
     * Configures SendGrid with API key from environment.
     */
    constructor() {
        const apiKey = process.env.SENDGRID_API_KEY;
        this.fromEmail = process.env.EMAIL_FROM || 'noreply@example.com';
        this.fromName = process.env.EMAIL_FROM_NAME || 'Sistema de Alquileres';

        if (apiKey) {
            sgMail.setApiKey(apiKey);
            this.enabled = true;
            logger.info('EmailService initialized with SendGrid');
        } else {
            this.enabled = false;
            logger.warn('EmailService disabled: SENDGRID_API_KEY not configured');
        }
    }

    /**
     * Sends an invoice issued notification.
     *
     * @param data - Invoice email data.
     * @returns Send result.
     */
    async sendInvoiceIssued(data: InvoiceEmailData): Promise<EmailSendResult> {
        const subject = `Factura ${data.invoice.invoiceNumber} - Período ${this.formatPeriod(data.invoice)}`;

        const html = this.renderInvoiceTemplate(data);

        return this.sendEmail({
            to: data.tenant.email,
            subject,
            html,
            template: 'invoice_issued',
        });
    }

    /**
     * Sends a payment reminder.
     *
     * @param data - Reminder email data.
     * @returns Send result.
     */
    async sendPaymentReminder(data: ReminderEmailData): Promise<EmailSendResult> {
        const subject = `Recordatorio: Factura ${data.invoice.invoiceNumber} vence en ${data.daysUntilDue} días`;

        const html = this.renderReminderTemplate(data);

        return this.sendEmail({
            to: data.tenant.email,
            subject,
            html,
            template: 'payment_reminder',
        });
    }

    /**
     * Sends an overdue notice.
     *
     * @param data - Overdue email data.
     * @returns Send result.
     */
    async sendOverdueNotice(data: OverdueEmailData): Promise<EmailSendResult> {
        const subject = `Aviso de Mora: Factura ${data.invoice.invoiceNumber} vencida`;

        const html = this.renderOverdueTemplate(data);

        return this.sendEmail({
            to: data.tenant.email,
            subject,
            html,
            template: 'overdue_notice',
        });
    }

    /**
     * Sends an email using SendGrid.
     */
    private async sendEmail(params: {
        to: string;
        subject: string;
        html: string;
        template: EmailTemplate;
    }): Promise<EmailSendResult> {
        if (!this.enabled) {
            logger.info('Email not sent (disabled)', {
                to: params.to,
                template: params.template,
            });
            return { success: false, error: 'Email service disabled' };
        }

        const msg: MailDataRequired = {
            to: params.to,
            from: {
                email: this.fromEmail,
                name: this.fromName,
            },
            subject: params.subject,
            html: params.html,
        };

        try {
            const response = await sgMail.send(msg);
            const messageId = response[0]?.headers?.['x-message-id'];

            logger.info('Email sent successfully', {
                to: params.to,
                template: params.template,
                messageId,
            });

            return { success: true, messageId };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            logger.error('Failed to send email', {
                to: params.to,
                template: params.template,
                error: errorMessage,
            });

            return { success: false, error: errorMessage };
        }
    }

    /**
     * Renders invoice issued template.
     */
    private renderInvoiceTemplate(data: InvoiceEmailData): string {
        const { invoice, tenant, owner } = data;

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9fafb; }
        .amount { font-size: 24px; font-weight: bold; color: #2563eb; }
        .details { margin: 20px 0; }
        .details table { width: 100%; border-collapse: collapse; }
        .details td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Factura Emitida</h1>
        </div>
        <div class="content">
            <p>Estimado/a ${tenant.name || 'Inquilino'},</p>
            <p>Se ha emitido la factura correspondiente a su alquiler:</p>
            
            <div class="details">
                <table>
                    <tr><td><strong>Factura N°:</strong></td><td>${invoice.invoiceNumber}</td></tr>
                    <tr><td><strong>Período:</strong></td><td>${this.formatPeriod(invoice)}</td></tr>
                    <tr><td><strong>Vencimiento:</strong></td><td>${this.formatDate(invoice.dueDate)}</td></tr>
                </table>
            </div>
            
            <p class="amount">Total: $${invoice.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
            
            ${invoice.withholdingsTotal > 0 ? `
            <p><small>Retenciones aplicadas: $${invoice.withholdingsTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</small></p>
            ` : ''}
            
            <p>Por favor, realice el pago antes de la fecha de vencimiento para evitar recargos.</p>
        </div>
        <div class="footer">
            <p>Este email fue enviado automáticamente. Por favor no responda a este mensaje.</p>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Renders payment reminder template.
     */
    private renderReminderTemplate(data: ReminderEmailData): string {
        const { invoice, tenant, daysUntilDue } = data;

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9fafb; }
        .amount { font-size: 24px; font-weight: bold; color: #f59e0b; }
        .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Recordatorio de Pago</h1>
        </div>
        <div class="content">
            <p>Estimado/a ${tenant.name || 'Inquilino'},</p>
            
            <div class="alert">
                <strong>Su factura vence en ${daysUntilDue} ${daysUntilDue === 1 ? 'día' : 'días'}</strong>
            </div>
            
            <p><strong>Factura N°:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Vencimiento:</strong> ${this.formatDate(invoice.dueDate)}</p>
            <p class="amount">Monto: $${invoice.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
            
            <p>Si ya realizó el pago, por favor ignore este mensaje.</p>
        </div>
        <div class="footer">
            <p>Este email fue enviado automáticamente. Por favor no responda a este mensaje.</p>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Renders overdue notice template.
     */
    private renderOverdueTemplate(data: OverdueEmailData): string {
        const { invoice, tenant, daysOverdue, lateFee } = data;

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9fafb; }
        .amount { font-size: 24px; font-weight: bold; color: #dc2626; }
        .alert { background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Aviso de Mora</h1>
        </div>
        <div class="content">
            <p>Estimado/a ${tenant.name || 'Inquilino'},</p>
            
            <div class="alert">
                <strong>Su factura está vencida hace ${daysOverdue} ${daysOverdue === 1 ? 'día' : 'días'}</strong>
            </div>
            
            <p><strong>Factura N°:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Venció el:</strong> ${this.formatDate(invoice.dueDate)}</p>
            
            ${lateFee > 0 ? `
            <p><strong>Recargo por mora:</strong> $${lateFee.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
            ` : ''}
            
            <p class="amount">Total a pagar: $${invoice.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
            
            <p>Por favor, regularice su situación a la brevedad para evitar mayores recargos.</p>
        </div>
        <div class="footer">
            <p>Este email fue enviado automáticamente. Por favor no responda a este mensaje.</p>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Formats invoice period.
     */
    private formatPeriod(invoice: InvoiceRecord): string {
        const start = this.formatDate(invoice.periodStart);
        const end = this.formatDate(invoice.periodEnd);
        return `${start} - ${end}`;
    }

    /**
     * Formats a date for display.
     */
    private formatDate(date: Date): string {
        return new Date(date).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    }
}
