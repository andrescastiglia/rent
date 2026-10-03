import { useEffect, useRef, useState } from 'react';
import { contactApi } from '@/api/contact-data';
import { AppButton, ChoiceGroup, Field } from '@/components/ui';
import { Text, View } from '@/components/themed-native';
import type {
  AddressCandidate,
  ContactAddress,
  ContactInput,
  PhoneField,
  PhonePreview,
} from '../../../shared/contact-data';
import { emptyContactAddress } from '../../../shared/contact-data';
export function ContactTools({
  value,
  onChange,
  phones = {},
  address,
  editAddress = false,
  initialAddress,
}: Readonly<{
  value: ContactInput;
  onChange: (next: ContactInput) => void;
  phones?: Partial<Record<PhoneField, string>>;
  address?: ContactAddress;
  editAddress?: boolean;
  initialAddress?: ContactAddress | null;
}>) {
  const [enabled, setEnabled] = useState(false),
    [country, setCountry] = useState('AR'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [publicAddress, setPublicAddress] = useState(false),
    [candidates, setCandidates] = useState<AddressCandidate[]>([]),
    [preview, setPreview] = useState<{
      field: PhoneField;
      phone: PhonePreview;
    } | null>(null);
  const acceptedAddress = useRef<string | null>(null);
  const current =
    address ?? value.contactAddress ?? initialAddress ?? emptyContactAddress();
  const addressKey = JSON.stringify(
    ['street', 'number', 'city', 'state', 'country', 'postalCode'].map((k) =>
      String(current[k as keyof ContactAddress] ?? '')
        .trim()
        .toLowerCase(),
    ),
  );
  useEffect(() => {
    if (
      value.normalization?.addressToken &&
      acceptedAddress.current !== null &&
      acceptedAddress.current !== addressKey
    ) {
      onChange({
        ...value,
        normalization: { ...value.normalization, addressToken: undefined },
      });
      setCandidates([]);
    }
  }, [addressKey, value, onChange]);
  useEffect(() => {
    let active = true;
    contactApi
      .config()
      .then((c) => {
        if (active) setEnabled(c?.normalization ?? false);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo normalizar');
    } finally {
      setBusy(false);
    }
  };
  if (!enabled && !editAddress) return null;
  return (
    <View style={{ gap: 12, marginVertical: 12 }}>
      <Text>Datos de contacto · opcional</Text>
      {editAddress && (
        <>
          {(
            [
              'street',
              'number',
              'city',
              'state',
              'country',
              'postalCode',
              'floor',
              'apartment',
            ] as const
          ).map((field) => (
            <Field
              key={field}
              label={
                {
                  street: 'Calle',
                  number: 'Número',
                  city: 'Ciudad',
                  state: 'Provincia',
                  country: 'País',
                  postalCode: 'Código postal',
                  floor: 'Piso',
                  apartment: 'Departamento',
                }[field]
              }
              value={current[field] ?? ''}
              onChangeText={(text) => {
                onChange({
                  ...value,
                  contactAddress: { ...current, [field]: text },
                  normalization: {
                    ...value.normalization,
                    addressToken:
                      field === 'floor' || field === 'apartment'
                        ? value.normalization?.addressToken
                        : undefined,
                  },
                });
                setCandidates([]);
              }}
            />
          ))}
          <ChoiceGroup
            label="Domicilio confidencial"
            value={current.confidential ? 'yes' : 'no'}
            options={[
              { label: 'Sí', value: 'yes' },
              { label: 'No', value: 'no' },
            ]}
            onChange={(v) =>
              onChange({
                ...value,
                contactAddress: { ...current, confidential: v === 'yes' },
                normalization: {
                  ...value.normalization,
                  addressToken: undefined,
                },
              })
            }
          />
        </>
      )}
      {enabled && (
        <>
          {Object.keys(phones).length > 0 && (
            <>
              <ChoiceGroup
                label="País del teléfono"
                value={country}
                options={['AR', 'UY', 'BR', 'CL', 'US', 'ES'].map((value) => ({
                  label: value,
                  value,
                }))}
                onChange={setCountry}
              />
              <Field
                label="Código de país telefónico (ISO)"
                value={country}
                onChangeText={(v) => setCountry(v.toUpperCase().slice(0, 2))}
              />
              {Object.entries(phones).map(([field, number]) => (
                <View key={field}>
                  <Text>
                    {field === 'ownerWhatsapp'
                      ? 'WhatsApp propietario'
                      : field.includes('emergency')
                        ? 'Teléfono de emergencia'
                        : 'Teléfono'}
                    : {number || 'Sin teléfono'}
                  </Text>
                  <AppButton
                    title="Normalizar teléfono"
                    disabled={!number?.trim() || busy}
                    onPress={() =>
                      void run(async () =>
                        setPreview({
                          field: field as PhoneField,
                          phone: await contactApi.phone(number ?? '', country),
                        }),
                      )
                    }
                  />
                  {value.normalization?.phones?.[field as PhoneField] && (
                    <Text>Se normalizará al guardar</Text>
                  )}
                </View>
              ))}
            </>
          )}
          {preview && (
            <View>
              {preview.phone.valid ? (
                <>
                  <Text>{preview.phone.international}</Text>
                  <AppButton
                    title="Aceptar teléfono"
                    onPress={() => {
                      if (phones[preview.field] !== preview.phone.original) {
                        setError('El teléfono cambió. Volvé a normalizar.');
                        setPreview(null);
                        return;
                      }
                      onChange({
                        ...value,
                        normalization: {
                          ...value.normalization,
                          phones: {
                            ...value.normalization?.phones,
                            [preview.field]: preview.phone.country,
                          },
                          phoneOriginals: {
                            ...value.normalization?.phoneOriginals,
                            [preview.field]: preview.phone.original,
                          },
                        },
                      });
                      setPreview(null);
                    }}
                  />
                </>
              ) : (
                <Text>
                  Completá país, código de área y teléfono.{' '}
                  {preview.phone.possible
                    ? 'Número posible, pero no válido.'
                    : 'Número incompleto o no válido.'}
                </Text>
              )}
            </View>
          )}
          {(address || editAddress) && (
            <>
              <ChoiceGroup
                label="Dirección pública, sin datos personales ni confidenciales"
                value={publicAddress ? 'yes' : 'no'}
                options={[
                  { label: 'Sí', value: 'yes' },
                  { label: 'No', value: 'no' },
                ]}
                onChange={(v) => setPublicAddress(v === 'yes')}
              />
              <AppButton
                title="Normalizar dirección"
                disabled={
                  !publicAddress ||
                  current.confidential ||
                  !current.street.trim() ||
                  !current.city.trim() ||
                  busy
                }
                onPress={() =>
                  void run(async () => {
                    const result = await contactApi.search(current);
                    setCandidates(result.candidates);
                    if (!result.candidates.length)
                      setError(
                        'No se encontraron direcciones. Podés guardar los datos originales.',
                      );
                  })
                }
              />
              {candidates.map((c) => (
                <AppButton
                  key={c.token}
                  title={`${c.label}${c.precise ? '' : ' · ubicación aproximada'}`}
                  onPress={() => {
                    acceptedAddress.current = addressKey;
                    onChange({
                      ...value,
                      normalization: {
                        ...value.normalization,
                        addressToken: c.token,
                      },
                    });
                    setCandidates([]);
                  }}
                />
              ))}
              {value.normalization?.addressToken && (
                <Text>
                  Dirección seleccionada. Se guardará con el registro.
                </Text>
              )}
              <Text>© OpenStreetMap contributors</Text>
            </>
          )}
        </>
      )}
      {busy && <Text>Normalizando…</Text>}
      {error && <Text accessibilityRole="alert">{error}</Text>}
    </View>
  );
}
