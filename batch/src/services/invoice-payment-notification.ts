interface InvoicePaymentNotificationInput {
  tenantName: string;
  invoiceNumber: string;
  dueDate: string;
  totalAmount: string;
  paymentLink: string | null;
}

export function buildInvoicePaymentNotification({
  tenantName,
  invoiceNumber,
  dueDate,
  totalAmount,
  paymentLink,
}: InvoicePaymentNotificationInput): string {
  return [
    `Hola ${tenantName},`,
    `tu factura ${invoiceNumber} ya está disponible.`,
    `Vencimiento: ${dueDate}.`,
    `Monto: ${totalAmount}.`,
    paymentLink ? `Pagar con MercadoPago: ${paymentLink}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
