import { useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { Text, View } from '@/components/themed-native';
import { AppButton, ChoiceGroup, Field } from '@/components/ui';
import { agendaApi, type AgendaEntry } from '@/api/agenda';
export function AgendaEntrySettings({
  entry,
  onSaved,
}: {
  entry: AgendaEntry;
  onSaved: () => void;
}) {
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]),
    [responsible, setResponsible] = useState(entry.responsibleUserId ?? ''),
    [minutes, setMinutes] = useState(String(entry.reminderMinutes)),
    [hour, setHour] = useState(String(entry.reminderHour)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const command = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    agendaApi
      .staff()
      .then((s) => {
        if (active) setStaff(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save() {
    setBusy(true);
    setError('');
    try {
      const body = {
        version: entry.version,
        responsibleUserId: responsible || null,
        reminderMinutes: Number(minutes),
        reminderHour: Number(hour),
      };
      const payload = JSON.stringify(body);
      if (command.current?.payload !== payload)
        command.current = { payload, key: Crypto.randomUUID() };
      await agendaApi.settings(entry.id, body, command.current.key);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <ChoiceGroup
        label="Responsable"
        value={responsible}
        options={[
          { value: '', label: 'Sin responsable' },
          ...staff.map((s) => ({ value: s.id, label: s.name })),
        ]}
        onChange={setResponsible}
      />
      {entry.scheduledAt && (
        <Field
          label="Minutos antes"
          value={minutes}
          keyboardType="numeric"
          onChangeText={setMinutes}
        />
      )}{' '}
      {entry.scheduledDate && (
        <Field
          label="Hora del recordatorio"
          value={hour}
          keyboardType="numeric"
          onChangeText={setHour}
        />
      )}{' '}
      {error && <Text accessibilityRole="alert">{error}</Text>}
      <AppButton title="Guardar" disabled={busy} onPress={() => void save()} />
    </View>
  );
}
