"use client";
import { RecoverableDocument } from "@/components/documents/RecoverableDocument";
import { contractDocumentsApi } from "@/lib/api/contract-documents";
export function ContractDocument(
  props: Readonly<{ leaseId: string; scopeKey: string }>,
) {
  return (
    <RecoverableDocument
      documentId={props.leaseId}
      scopeKey={props.scopeKey}
      api={contractDocumentsApi}
      messages="contractDocument"
    />
  );
}
