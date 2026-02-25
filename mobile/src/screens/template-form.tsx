import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { AppButton, ChoiceGroup, Field } from '@/components/ui';
import type { ContractType } from '@/types/lease';
import type { PaymentDocumentTemplateType } from '@/types/payment';

export type TemplateKind = 'lease' | 'payment';

export type TemplateFormInput = {
  kind: TemplateKind;
  name: string;
  templateBody: string;
  isActive: boolean;
  isDefault?: boolean;
  contractType?: ContractType;
  paymentType?: PaymentDocumentTemplateType;
};

export type TemplateFormInitial = TemplateFormInput & { id?: string };

const schema = z.object({
  kind: z.enum(['lease', 'payment']),
  name: z.string().min(2),
  templateBody: z.string().min(5),
  isActive: z.enum(['yes', 'no']).default('yes'),
  isDefault: z.enum(['yes', 'no']).default('no'),
  contractType: z.enum(['rental', 'sale']).optional(),
  paymentType: z.enum(['receipt', 'invoice', 'credit_note']).optional(),
});

type FormValues = z.input<typeof schema>;

type TemplateFormProps = {
  mode: 'create' | 'edit';
  initial?: TemplateFormInitial;
  submitting?: boolean;
  onSubmit: (payload: TemplateFormInput) => Promise<void>;
  submitLabel: string;
  testIDPrefix?: string;
};

const kindOptions = [
  { label: 'Contrato', value: 'lease' as const },
  { label: 'Comprobante', value: 'payment' as const },
];

const contractTypeOptions: Array<{ label: string; value: ContractType }> = [
  { label: 'Alquiler', value: 'rental' },
  { label: 'Venta', value: 'sale' },
];

const paymentTypeOptions: Array<{ label: string; value: PaymentDocumentTemplateType }> = [
  { label: 'Recibo', value: 'receipt' },
  { label: 'Factura', value: 'invoice' },
  { label: 'Nota crédito', value: 'credit_note' },
];

const boolOptions = [
  { label: 'Sí', value: 'yes' as const },
  { label: 'No', value: 'no' as const },
];

export function TemplateForm({
  mode,
  initial,
  submitting,
  onSubmit,
  submitLabel,
  testIDPrefix = 'templateForm',
}: TemplateFormProps) {
  const { t } = useTranslation();

  const defaults: FormValues = useMemo(
    () => ({
      kind: initial?.kind ?? 'lease',
      name: initial?.name ?? '',
      templateBody: initial?.templateBody ?? '',
      isActive: initial?.isActive === false ? 'no' : 'yes',
      isDefault: initial?.isDefault ? 'yes' : 'no',
      contractType: initial?.contractType ?? 'rental',
      paymentType: initial?.paymentType ?? 'receipt',
    }),
    [initial],
  );

  const { control, handleSubmit, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const kind = watch('kind');

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      kind: values.kind,
      name: values.name,
      templateBody: values.templateBody,
      isActive: values.isActive === 'yes',
      isDefault: values.kind === 'payment' ? values.isDefault === 'yes' : undefined,
      contractType: values.kind === 'lease' ? values.contractType ?? 'rental' : undefined,
      paymentType: values.kind === 'payment' ? values.paymentType ?? 'receipt' : undefined,
    });
  });

  return (
    <View>
      {mode === 'create' ? (
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <ChoiceGroup
              label={t('common.filter')}
              value={field.value}
              onChange={field.onChange}
              options={kindOptions.map((option) => ({
                value: option.value,
                label: option.value === 'lease' ? t('leases.title') : t('templatesHub.title'),
              }))}
              testID={`${testIDPrefix}.kind`}
            />
          )}
        />
      ) : null}

      {kind === 'lease' ? (
        <Controller
          control={control}
          name="contractType"
          render={({ field }) => (
            <ChoiceGroup
              label={t('leases.fields.contractType')}
              value={field.value ?? 'rental'}
              onChange={field.onChange}
              options={contractTypeOptions.map((option) => ({
                value: option.value,
                label: t(`leases.contractTypes.${option.value}`),
              }))}
              testID={`${testIDPrefix}.contractType`}
            />
          )}
        />
      ) : (
        <Controller
          control={control}
          name="paymentType"
          render={({ field }) => (
            <ChoiceGroup
              label={t('templatesHub.scopes.invoice')}
              value={field.value ?? 'receipt'}
              onChange={field.onChange}
              options={paymentTypeOptions.map((option) => ({
                value: option.value,
                label:
                  option.value === 'receipt'
                    ? t('templatesHub.scopes.receipt')
                    : option.value === 'invoice'
                      ? t('templatesHub.scopes.invoice')
                      : t('templatesHub.scopes.creditNote'),
              }))}
              testID={`${testIDPrefix}.paymentType`}
            />
          )}
        />
      )}

      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Field label={t('properties.fields.name')} value={field.value} onChangeText={field.onChange} testID={`${testIDPrefix}.name`} />
        )}
      />
      <Controller
        control={control}
        name="templateBody"
        render={({ field }) => (
          <Field
            label={t('leases.fields.terms')}
            value={field.value}
            onChangeText={field.onChange}
            testID={`${testIDPrefix}.templateBody`}
          />
        )}
      />
      <Controller
        control={control}
        name="isActive"
        render={({ field }) => (
            <ChoiceGroup
              label={t('templatesHub.activeLabel')}
              value={field.value ?? 'yes'}
              onChange={field.onChange}
              options={boolOptions.map((option) => ({ value: option.value, label: option.value === 'yes' ? t('common.yes') : t('common.no') }))}
              testID={`${testIDPrefix}.isActive`}
            />
          )}
      />
      {kind === 'payment' ? (
        <Controller
          control={control}
          name="isDefault"
          render={({ field }) => (
            <ChoiceGroup
              label={t('templatesHub.defaultLabel')}
              value={field.value ?? 'no'}
              onChange={field.onChange}
              options={boolOptions.map((option) => ({ value: option.value, label: option.value === 'yes' ? t('common.yes') : t('common.no') }))}
              testID={`${testIDPrefix}.isDefault`}
            />
          )}
        />
      ) : null}

      {Object.values(formState.errors).map((item) => {
        if (!item?.message) return null;
        return (
          <Text key={item.message} style={styles.error}>
            {item.message}
          </Text>
        );
      })}

      <AppButton
        title={submitLabel}
        onPress={submit}
        loading={submitting}
        disabled={submitting}
        testID={`${testIDPrefix}.submit`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    color: '#b91c1c',
    marginBottom: 6,
  },
});
