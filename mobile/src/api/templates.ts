import { leasesApi } from '@/api/leases';
import { paymentDocumentTemplatesApi } from '@/api/payments';
import type { ContractType } from '@/types/lease';
import type { PaymentDocumentTemplateType } from '@/types/payment';

export type TemplateKind = 'lease' | 'payment';

export type UnifiedTemplate = {
  id: string;
  kind: TemplateKind;
  name: string;
  templateBody: string;
  isActive: boolean;
  isDefault?: boolean;
  contractType?: ContractType;
  paymentType?: PaymentDocumentTemplateType;
  createdAt: string;
  updatedAt: string;
};

export type UpsertTemplateInput = {
  kind: TemplateKind;
  name: string;
  templateBody: string;
  isActive: boolean;
  isDefault?: boolean;
  contractType?: ContractType;
  paymentType?: PaymentDocumentTemplateType;
};

const mapLeaseTemplate = (item: Awaited<ReturnType<typeof leasesApi.getTemplates>>[number]): UnifiedTemplate => ({
  id: item.id,
  kind: 'lease',
  name: item.name,
  templateBody: item.templateBody,
  isActive: item.isActive,
  isDefault: undefined,
  contractType: item.contractType,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const mapPaymentTemplate = (
  item: Awaited<ReturnType<typeof paymentDocumentTemplatesApi.list>>[number],
): UnifiedTemplate => ({
  id: item.id,
  kind: 'payment',
  name: item.name,
  templateBody: item.templateBody,
  isActive: item.isActive,
  isDefault: item.isDefault,
  paymentType: item.type,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

export async function listTemplates(kind?: TemplateKind): Promise<UnifiedTemplate[]> {
  if (kind === 'lease') {
    const templates = await leasesApi.getTemplates();
    return templates.map(mapLeaseTemplate);
  }

  if (kind === 'payment') {
    const templates = await paymentDocumentTemplatesApi.list();
    return templates.map(mapPaymentTemplate);
  }

  const [leaseTemplates, paymentTemplates] = await Promise.all([
    leasesApi.getTemplates(),
    paymentDocumentTemplatesApi.list(),
  ]);

  return [...leaseTemplates.map(mapLeaseTemplate), ...paymentTemplates.map(mapPaymentTemplate)];
}

export async function getTemplate(kind: TemplateKind, id: string): Promise<UnifiedTemplate | null> {
  const items = await listTemplates(kind);
  return items.find((item) => item.id === id) ?? null;
}

export async function createTemplate(payload: UpsertTemplateInput): Promise<UnifiedTemplate> {
  if (payload.kind === 'lease') {
    const created = await leasesApi.createTemplate({
      name: payload.name,
      contractType: payload.contractType ?? 'rental',
      templateBody: payload.templateBody,
      isActive: payload.isActive,
    });
    return mapLeaseTemplate(created);
  }

  const created = await paymentDocumentTemplatesApi.create({
    type: payload.paymentType ?? 'receipt',
    name: payload.name,
    templateBody: payload.templateBody,
    isActive: payload.isActive,
    isDefault: payload.isDefault,
  });
  return mapPaymentTemplate(created);
}

export async function updateTemplate(
  kind: TemplateKind,
  id: string,
  payload: Omit<UpsertTemplateInput, 'kind'>,
): Promise<UnifiedTemplate> {
  if (kind === 'lease') {
    const updated = await leasesApi.updateTemplate(id, {
      name: payload.name,
      contractType: payload.contractType,
      templateBody: payload.templateBody,
      isActive: payload.isActive,
    });
    return mapLeaseTemplate(updated);
  }

  const updated = await paymentDocumentTemplatesApi.update(id, {
    type: payload.paymentType,
    name: payload.name,
    templateBody: payload.templateBody,
    isActive: payload.isActive,
    isDefault: payload.isDefault,
  });
  return mapPaymentTemplate(updated);
}

export async function deleteTemplate(kind: TemplateKind, id: string): Promise<void> {
  if (kind === 'lease') {
    await leasesApi.deleteTemplate(id);
    return;
  }

  await paymentDocumentTemplatesApi.delete(id);
}
