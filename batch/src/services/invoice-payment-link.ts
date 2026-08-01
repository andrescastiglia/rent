const SUPPORTED_LOCALES = new Set(["es", "en", "pt"]);

export function buildInvoicePaymentUrl(
  invoiceId: string,
  locale = "es",
  frontendUrl = process.env.FRONTEND_URL,
): string | null {
  const baseUrl = frontendUrl?.split(",")[0]?.trim();
  if (!baseUrl) {
    return null;
  }

  try {
    const normalizedLocale = SUPPORTED_LOCALES.has(locale) ? locale : "es";
    const url = new URL(
      `/${normalizedLocale}/invoices/${encodeURIComponent(invoiceId)}`,
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    );
    url.searchParams.set("pay", "mercadopago");
    return url.toString();
  } catch {
    return null;
  }
}
