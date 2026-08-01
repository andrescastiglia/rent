const SUPPORTED_LOCALES = new Set(['es', 'en', 'pt']);

function parseFrontendOrigin(frontendUrl: string | undefined): URL | null {
  const [firstOrigin] = frontendUrl?.split(',') ?? [];
  const configuredOrigin = firstOrigin?.trim();
  if (!configuredOrigin) {
    return null;
  }

  try {
    return new URL(configuredOrigin);
  } catch {
    return null;
  }
}

export function buildInvoicePaymentUrl(
  frontendUrl: string | undefined,
  invoiceId: string,
  locale = 'es',
): string | null {
  const url = parseFrontendOrigin(frontendUrl);
  if (!url) {
    return null;
  }

  const normalizedLocale = SUPPORTED_LOCALES.has(locale) ? locale : 'es';
  url.pathname = `/${normalizedLocale}/invoices/${encodeURIComponent(invoiceId)}`;
  url.search = '';
  url.hash = '';
  url.searchParams.set('pay', 'mercadopago');
  return url.toString();
}
