const SUPPORTED_LOCALES = new Set(['es', 'en', 'pt']);

export function buildInvoicePaymentUrl(
  frontendUrl: string | undefined,
  invoiceId: string,
  locale = 'es',
): string | null {
  const baseUrl = frontendUrl?.split(',')[0]?.trim();
  if (!baseUrl) {
    return null;
  }

  try {
    const normalizedLocale = SUPPORTED_LOCALES.has(locale) ? locale : 'es';
    const url = new URL(
      `/${normalizedLocale}/invoices/${encodeURIComponent(invoiceId)}`,
      baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    );
    url.searchParams.set('pay', 'mercadopago');
    return url.toString();
  } catch {
    return null;
  }
}
