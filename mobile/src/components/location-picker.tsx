import { useState } from 'react';
import { contactApi } from '@/api/contact-data';
import type { LocationRef } from '@/api/contact-types';
import { View, Text } from './themed-native';
import { AppButton, ChoiceGroup, Field } from './ui';
export function LocationPicker({
  value,
  onChange,
}: {
  value: LocationRef | null;
  onChange: (value: LocationRef | null) => void;
}) {
  const [search, setSearch] = useState(''),
    [places, setPlaces] = useState<
      Array<LocationRef & { name: string; address: string }>
    >([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError('');
    try {
      setPlaces(await contactApi.places(search));
    } catch {
      setError('No se pudieron cargar los lugares');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Text>
        Destino de la visita. Sin selección, se usa el domicilio del contacto.
      </Text>
      <Field
        label="Buscar lugar registrado"
        value={search}
        onChangeText={setSearch}
      />
      <AppButton
        title="Buscar lugares"
        disabled={busy}
        onPress={() => void load()}
      />
      <ChoiceGroup
        label="Lugar registrado"
        value={value ? `${value.type}:${value.id}` : ''}
        options={[
          { value: '', label: 'Domicilio del contacto' },
          ...(value &&
          !places.some((p) => p.type === value.type && p.id === value.id)
            ? [
                {
                  value: `${value.type}:${value.id}`,
                  label: 'Destino registrado',
                },
              ]
            : []),
          ...places.map((p) => ({
            value: `${p.type}:${p.id}`,
            label: `${p.name} · ${p.address} · ${p.type}`,
          })),
        ]}
        onChange={(key) => {
          const place = places.find((p) => `${p.type}:${p.id}` === key);
          onChange(place ? { type: place.type, id: place.id } : null);
        }}
      />
      {error && <Text accessibilityRole="alert">{error}</Text>}
    </View>
  );
}
