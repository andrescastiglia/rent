'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Info, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { leasesApi } from '@/lib/api/leases';
import { LeaseTemplate, ContractType } from '@/types/lease';

const emptyForm = {
  name: '',
  templateBody: '',
  isActive: true,
};

const TEMPLATE_VARIABLE_GROUPS: Record<string, string[]> = {
  global: ['today'],
  lease: [
    'lease.leaseNumber',
    'lease.contractType',
    'lease.startDate',
    'lease.endDate',
    'lease.monthlyRent',
    'lease.fiscalValue',
    'lease.currency',
    'lease.paymentFrequency',
    'lease.paymentDueDay',
    'lease.billingFrequency',
    'lease.billingDay',
    'lease.lateFeeType',
    'lease.lateFeeValue',
    'lease.lateFeeGraceDays',
    'lease.lateFeeMax',
    'lease.adjustmentType',
    'lease.adjustmentValue',
    'lease.adjustmentFrequencyMonths',
    'lease.inflationIndexType',
    'lease.securityDeposit',
    'lease.notes',
  ],
  property: [
    'property.name',
    'property.addressStreet',
    'property.addressNumber',
    'property.addressCity',
    'property.addressState',
    'property.addressPostalCode',
    'property.addressCountry',
  ],
  owner: ['owner.firstName', 'owner.lastName', 'owner.fullName', 'owner.email', 'owner.phone'],
  tenant: ['tenant.firstName', 'tenant.lastName', 'tenant.fullName', 'tenant.email', 'tenant.phone'],
  buyer: ['buyer.firstName', 'buyer.lastName', 'buyer.fullName', 'buyer.email', 'buyer.phone'],
};

export default function LeaseTemplatesPage() {
  const t = useTranslations('leases');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contractType, setContractType] = useState<ContractType>('rental');
  const [templates, setTemplates] = useState<LeaseTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadTemplates = async (type: ContractType) => {
    setLoading(true);
    try {
      const data = await leasesApi.getTemplates(type);
      setTemplates(data);
      if (data.length > 0) {
        const first = data[0];
        setSelectedTemplateId(first.id);
        setForm({
          name: first.name,
          templateBody: first.templateBody,
          isActive: first.isActive,
        });
      } else {
        setSelectedTemplateId(null);
        setForm(emptyForm);
      }
    } catch (error) {
      console.error('Failed to load templates', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates(contractType);
  }, [contractType]);

  const handleSelectTemplate = (template: LeaseTemplate) => {
    setSelectedTemplateId(template.id);
    setForm({
      name: template.name,
      templateBody: template.templateBody,
      isActive: template.isActive,
    });
  };

  const handleNew = () => {
    setSelectedTemplateId(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.templateBody.trim()) return;
    setSaving(true);
    try {
      if (selectedTemplateId) {
        const updated = await leasesApi.updateTemplate(selectedTemplateId, {
          name: form.name.trim(),
          templateBody: form.templateBody,
          isActive: form.isActive,
          contractType,
        });
        setTemplates((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await leasesApi.createTemplate({
          name: form.name.trim(),
          templateBody: form.templateBody,
          isActive: form.isActive,
          contractType,
        });
        setTemplates((prev) => [created, ...prev]);
        setSelectedTemplateId(created.id);
      }
    } catch (error) {
      console.error('Failed to save template', error);
      alert(tc('error'));
    } finally {
      setSaving(false);
    }
  };

  const handleInsertVariable = (variableKey: string) => {
    const token = `{{${variableKey}}}`;
    setForm((prev) => ({
      ...prev,
      templateBody: prev.templateBody ? `${prev.templateBody}\n${token}` : token,
    }));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/leases`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t('backToList')}
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('templates.title')}</h1>
        <div className="flex items-center gap-2">
          <select
            value={contractType}
            onChange={(e) => setContractType(e.target.value as ContractType)}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
          >
            <option value="rental">{t('contractTypes.rental')}</option>
            <option value="sale">{t('contractTypes.sale')}</option>
          </select>
          <button
            type="button"
            onClick={handleNew}
            className="btn btn-secondary"
          >
            {t('templates.new')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-52">
          <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('templates.listTitle')}
              </h2>
              {templates.length > 0 ? (
                templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleSelectTemplate(template)}
                    className={`w-full text-left rounded-md border p-3 ${
                      selectedTemplateId === template.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{template.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {template.isActive ? t('templates.active') : t('templates.inactive')}
                    </p>
                  </button>
                ))
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('templates.empty')}</p>
              )}
            </div>
          </div>

          <div className="xl:col-span-8">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t('templates.fields.name')}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <textarea
                rows={16}
                value={form.templateBody}
                onChange={(e) => setForm((prev) => ({ ...prev, templateBody: e.target.value }))}
                placeholder={t('templates.fields.body')}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm font-mono"
              />
              <div className="rounded-md border border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-900/20 p-3">
                <div className="flex items-start gap-2 mb-2">
                  <Info size={16} className="mt-0.5 text-blue-700 dark:text-blue-300" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                      {t('templates.variables.title')}
                    </p>
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                      {t('templates.variables.description')}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {Object.entries(TEMPLATE_VARIABLE_GROUPS).map(([group, keys]) => (
                    <div key={group}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-200">
                        {t(`templates.variables.groups.${group}`)}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {keys.map((key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleInsertVariable(key)}
                            className="rounded border border-blue-200 bg-white px-2 py-1 text-xs font-mono text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/40"
                          >
                            {`{{${key}}}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <label className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={form.isActive}
                  onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                {t('templates.fields.active')}
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="btn btn-primary"
                >
                  {saving ? tc('saving') : tc('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
