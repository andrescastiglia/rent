"use client";
import { RecoverableDocument } from "@/components/documents/RecoverableDocument";
import { invoiceDocumentsApi } from "@/lib/api/invoice-documents";
export function InvoiceDocument(
  props: Readonly<{ invoiceId: string; scopeKey: string }>,
) {
  return (
    <RecoverableDocument
      documentId={props.invoiceId}
      scopeKey={props.scopeKey}
      api={invoiceDocumentsApi}
      messages="invoiceDocument"
    />
  );
}
