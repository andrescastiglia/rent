import { LocationPicker } from '@/components/location-picker';
import type { LocationRef } from '@/api/contact-types';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from '@/components/themed-native';
import { AppButton, ChoiceGroup, Field, DateField } from '@/components/ui';
import * as Crypto from 'expo-crypto';
import {
  agendaApi,
  type AgendaEntry,
  type AgendaPerson,
  type AgendaTaskInput,
} from '@/api/agenda';
import { civilDateTimeToIso } from '../../../shared/agenda';
export function AgendaTaskForm({
  entry,
  onSaved,
  personType,
  personId,
  relatedEntryId,
}: {
  entry?: AgendaEntry;
  personType?: string;
  personId?: string;
  relatedEntryId?: string;
  onSaved: (id: string) => void;
}) {
  const [location, setLocation] = useState<LocationRef | null>(
    entry?.locationType && entry.locationId
      ? { type: entry.locationType, id: entry.locationId }
      : null,
  );
  const [title, setTitle] = useState(entry?.title ?? ''),
    [description, setDescription] = useState(entry?.description ?? ''),
    [kind, setKind] = useState(entry?.kind ?? 'task'),
    [person, setPerson] = useState(
      personType && personId ? `${personType}:${personId}` : '',
    ),
    [search, setSearch] = useState(''),
    [responsible, setResponsible] = useState(entry?.responsibleUserId ?? '');
  const [mode, setMode] = useState(
      entry?.scheduledDate ? 'date' : entry?.scheduledAt ? 'time' : 'none',
    ),
    [date, setDate] = useState(entry?.scheduledDate ?? ''),
    [time, setTime] = useState(''),
    [end, setEnd] = useState(''),
    [minutes, setMinutes] = useState(String(entry?.reminderMinutes ?? 15)),
    [hour, setHour] = useState(String(entry?.reminderHour ?? 9));
  const [people, setPeople] = useState<AgendaPerson[]>([]),
    [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useRef<{ payload: string; key: string } | null>(null);
  const [companyConfig, setCompanyConfig] = useState<{
    timezone: string;
    reminderMinutes: number;
    reminderHour: number;
  }>();
  const timezone =
    entry?.timezone ??
    companyConfig?.timezone ??
    'America/Argentina/Buenos_Aires';
  useEffect(() => {
    let active = true;
    agendaApi
      .config()
      .then((c) => {
        if (active) {
          setCompanyConfig(c);
          if (!entry) {
            setMinutes(String(c.reminderMinutes));
            setHour(String(c.reminderHour));
          }
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [entry]);
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
    if (entry?.scheduledAt) {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })
          .formatToParts(new Date(entry.scheduledAt))
          .map((p) => [p.type, p.value]),
      );
      setTime(
        `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`,
      );
    }
    if (entry?.endsAt) {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })
          .formatToParts(new Date(entry.endsAt))
          .map((p) => [p.type, p.value]),
      );
      setEnd(
        `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`,
      );
    }
    return () => {
      active = false;
    };
  }, [entry, timezone]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      agendaApi
        .people(search)
        .then((s) => {
          if (active) setPeople(s);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      const [personType, personId] = person.split(':');
      if (!title.trim()) throw new Error('Ingresá el título');
      if (mode === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new Error('Ingresá una fecha válida');
      const payload: AgendaTaskInput = {
        title,
        description: description || null,
        kind,
        locationType: kind === 'visit' ? (location?.type ?? null) : null,
        locationId: kind === 'visit' ? (location?.id ?? null) : null,
        responsibleUserId: responsible || null,
        scheduledDate: mode === 'date' ? date : null,
        scheduledAt:
          mode === 'time' ? civilDateTimeToIso(time, timezone) : null,
        endsAt:
          mode === 'time' && end ? civilDateTimeToIso(end, timezone) : null,
        reminderMinutes: Number(minutes),
        reminderHour: Number(hour),
        ...(!entry
          ? {
              personType: personType || null,
              personId: personId || null,
              relatedEntryId: relatedEntryId ?? null,
            }
          : {}),
      };
      const signature = JSON.stringify(payload);
      if (request.current?.payload !== signature)
        request.current = { payload: signature, key: Crypto.randomUUID() };
      let id: string;
      if (entry) {
        await agendaApi.update(
          entry.id,
          { ...payload, version: Number(entry.version.split(':')[0]) },
          request.current!.key,
        );
        id = entry.id;
      } else id = (await agendaApi.create(payload, request.current!.key)).id;
      onSaved(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Field label="Título" value={title} onChangeText={setTitle} />
      <ChoiceGroup
        label="Tipo"
        value={kind}
        options={[
          { value: 'task', label: 'Tarea' },
          { value: 'call', label: 'Llamada' },
          { value: 'visit', label: 'Visita' },
        ]}
        onChange={setKind}
      />
      {kind === 'visit' && (
        <LocationPicker value={location} onChange={setLocation} />
      )}
      <Field
        label="Descripción"
        value={description}
        onChangeText={setDescription}
      />
      {!entry && (
        <>
          <Field
            label="Buscar persona"
            value={search}
            onChangeText={setSearch}
          />
          <ChoiceGroup
            label="Persona opcional"
            value={person}
            options={[
              { value: '', label: 'Sin persona vinculada' },
              ...people.map((p) => ({
                value: `${p.personType}:${p.personId}`,
                label: `${p.name} · ${p.personType}`,
              })),
            ]}
            onChange={setPerson}
          />
        </>
      )}
      <ChoiceGroup
        label="Responsable"
        value={responsible}
        options={[
          { value: '', label: 'Sin responsable' },
          ...staff.map((s) => ({ value: s.id, label: s.name })),
        ]}
        onChange={setResponsible}
      />
      <ChoiceGroup
        label="Programación"
        value={mode}
        options={[
          { value: 'none', label: 'Sin fecha' },
          { value: 'date', label: 'Fecha sin hora' },
          { value: 'time', label: 'Fecha y hora' },
        ]}
        onChange={setMode}
      />
      {mode === 'date' && (
        <>
          <DateField label="Fecha" value={date} onChange={setDate} />
          <Field
            label="Hora del recordatorio (0 a 23)"
            value={hour}
            onChangeText={setHour}
            keyboardType="numeric"
          />
        </>
      )}
      {mode === 'time' && (
        <>
          <Text>Zona: {timezone}</Text>
          <Field
            label="Fecha y hora (AAAA-MM-DDTHH:mm)"
            value={time}
            onChangeText={setTime}
          />
          <Field
            label="Fin opcional (AAAA-MM-DDTHH:mm)"
            value={end}
            onChangeText={setEnd}
          />
          <Field
            label="Recordatorio: minutos antes"
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="numeric"
          />
        </>
      )}
      {error && <Text accessibilityRole="alert">{error}</Text>}
      <AppButton
        title={busy ? 'Guardando…' : 'Guardar'}
        disabled={busy || !companyConfig}
        onPress={() => void save()}
      />
    </View>
  );
}
