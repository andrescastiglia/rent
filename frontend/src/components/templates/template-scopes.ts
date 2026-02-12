import { ContractType } from "@/types/lease";
import { PaymentDocumentTemplateType } from "@/types/payment";

export type TemplateScope =
  | "contract_rental"
  | "contract_sale"
  | "receipt"
  | "invoice"
  | "credit_note";

export type EditableTemplate = {
  id: string;
  name: string;
  templateBody: string;
  isActive: boolean;
  isDefault?: boolean;
};

export const emptyTemplateForm = {
  name: "",
  templateBody: "",
  isActive: true,
  isDefault: false,
};

export const TEMPLATE_VARIABLE_GROUPS: Record<
  TemplateScope,
  Record<string, string[]>
> = {
  contract_rental: {
    global: ["today"],
    lease: [
      "lease.leaseNumber",
      "lease.contractType",
      "lease.startDate",
      "lease.endDate",
      "lease.monthlyRent",
      "lease.currency",
      "lease.paymentFrequency",
      "lease.paymentDueDay",
      "lease.securityDeposit",
      "lease.notes",
    ],
    property: [
      "property.name",
      "property.addressStreet",
      "property.addressNumber",
      "property.addressCity",
      "property.addressState",
    ],
    owner: [
      "owner.firstName",
      "owner.lastName",
      "owner.fullName",
      "owner.email",
    ],
    tenant: [
      "tenant.firstName",
      "tenant.lastName",
      "tenant.fullName",
      "tenant.email",
    ],
  },
  contract_sale: {
    global: ["today"],
    lease: [
      "lease.leaseNumber",
      "lease.contractType",
      "lease.startDate",
      "lease.endDate",
      "lease.fiscalValue",
      "lease.currency",
      "lease.notes",
    ],
    property: [
      "property.name",
      "property.addressStreet",
      "property.addressNumber",
      "property.addressCity",
      "property.addressState",
    ],
    owner: [
      "owner.firstName",
      "owner.lastName",
      "owner.fullName",
      "owner.email",
    ],
    buyer: [
      "buyer.firstName",
      "buyer.lastName",
      "buyer.fullName",
      "buyer.email",
    ],
  },
  receipt: {
    global: ["today"],
    receipt: [
      "receipt.id",
      "receipt.number",
      "receipt.issuedAt",
      "receipt.amount",
      "receipt.currency",
      "receipt.currencySymbol",
    ],
    payment: [
      "payment.id",
      "payment.date",
      "payment.method",
      "payment.reference",
      "payment.notes",
      "payment.itemsSummary",
    ],
    tenant: [
      "tenant.firstName",
      "tenant.lastName",
      "tenant.fullName",
      "tenant.email",
    ],
    property: [
      "property.name",
      "property.addressStreet",
      "property.addressNumber",
      "property.addressCity",
    ],
  },
  invoice: {
    global: ["today"],
    invoice: [
      "invoice.id",
      "invoice.number",
      "invoice.issueDate",
      "invoice.dueDate",
      "invoice.periodStart",
      "invoice.periodEnd",
      "invoice.status",
      "invoice.subtotal",
      "invoice.lateFee",
      "invoice.adjustments",
      "invoice.total",
      "invoice.currency",
      "invoice.currencySymbol",
      "invoice.notes",
    ],
    owner: [
      "owner.firstName",
      "owner.lastName",
      "owner.fullName",
      "owner.email",
    ],
    tenant: [
      "tenant.firstName",
      "tenant.lastName",
      "tenant.fullName",
      "tenant.email",
    ],
    property: [
      "property.name",
      "property.addressStreet",
      "property.addressNumber",
      "property.addressCity",
    ],
  },
  credit_note: {
    global: ["today"],
    creditNote: [
      "creditNote.id",
      "creditNote.number",
      "creditNote.issueDate",
      "creditNote.amount",
      "creditNote.currency",
      "creditNote.reason",
    ],
    invoice: [
      "invoice.id",
      "invoice.number",
      "invoice.dueDate",
      "invoice.total",
      "invoice.currency",
    ],
    tenant: ["tenant.firstName", "tenant.lastName", "tenant.fullName"],
  },
};

export const scopeToContractType: Record<
  Extract<TemplateScope, "contract_rental" | "contract_sale">,
  ContractType
> = {
  contract_rental: "rental",
  contract_sale: "sale",
};

export const scopeToDocumentType: Record<
  Extract<TemplateScope, "receipt" | "invoice" | "credit_note">,
  PaymentDocumentTemplateType
> = {
  receipt: "receipt",
  invoice: "invoice",
  credit_note: "credit_note",
};

export function isContractScope(
  scope: TemplateScope,
): scope is Extract<TemplateScope, "contract_rental" | "contract_sale"> {
  return scope === "contract_rental" || scope === "contract_sale";
}

export function parseTemplateScope(
  value: string | null | undefined,
): TemplateScope {
  const scopes: TemplateScope[] = [
    "contract_rental",
    "contract_sale",
    "receipt",
    "invoice",
    "credit_note",
  ];
  if (value && scopes.includes(value as TemplateScope)) {
    return value as TemplateScope;
  }
  return "contract_rental";
}
