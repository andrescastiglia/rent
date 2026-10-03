import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Text, View } from '@/components/themed-native';
import { Screen } from '@/components/screen';
import { AppButton } from '@/components/ui';
import { agendaApi } from '@/api/agenda';
import { AgendaEntrySettings } from '@/screens/agenda-entry-settings';
import { AgendaTaskForm } from '@/screens/agenda-task-form';
import { useAuth } from '@/contexts/auth-context';
import { syncAgendaCalendar } from '@/calendar/agenda-calendar';
export default function Page() {
  const router = useRouter(),
    { id } = useLocalSearchParams<{ id: string }>(),
    { user } = useAuth();
  const [editing, setEditing] = useState(false),
    [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['agenda-entry', user?.companyId, id],
    queryFn: () => agendaApi.entry(id),
  });
  const entry = query.data;
  const person = useQuery({
    queryKey: [
      'agenda-person',
      user?.companyId,
      entry?.personType,
      entry?.personId,
    ],
    queryFn: () => agendaApi.person(entry!.personType!, entry!.personId!),
    enabled: Boolean(entry?.personId && entry?.personType),
  });
  const related = useQuery({
    queryKey: [
      'agenda-person-tasks',
      user?.companyId,
      entry?.personType,
      entry?.personId,
    ],
    queryFn: () =>
      agendaApi.list({
        personType: entry!.personType!,
        personId: entry!.personId!,
        status: 'all',
      }),
    enabled: Boolean(entry?.personId),
  });
  async function saved() {
    setEditing(false);
    await query.refetch();
    await related.refetch();
    if (user)
      try {
        await syncAgendaCalendar(user);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : 'No se pudo actualizar el calendario',
        );
      }
  }
  async function status(value: string) {
    try {
      await agendaApi.update(
        id,
        { version: Number(entry!.version.split(':')[0]), status: value },
        Crypto.randomUUID(),
      );
      await saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }
  return (
    <Screen>
      <View style={{ gap: 12 }}>
        {query.error && (
          <Text accessibilityRole="alert">{query.error.message}</Text>
        )}
        {error && <Text accessibilityRole="alert">{error}</Text>}
        {entry && (
          <>
            <Text style={{ fontSize: 22, fontWeight: '600' }}>
              {entry.personName ?? entry.title}
            </Text>
            <Text>{entry.title}</Text>
            <Text>{entry.description}</Text>
            <Text>
              {entry.scheduledDate ?? entry.scheduledAt ?? 'Por programar'} ·{' '}
              {entry.responsibleName || 'Sin responsable'} · {entry.status}
            </Text>
            {entry.editable && entry.canEdit && (
              <>
                <AppButton
                  title="Editar tarea"
                  onPress={() => setEditing(!editing)}
                />
                <AppButton
                  title="Completar"
                  disabled={entry.status !== 'pending'}
                  onPress={() => void status('completed')}
                />
                <AppButton
                  title="Cancelar tarea"
                  disabled={entry.status !== 'pending'}
                  onPress={() => void status('cancelled')}
                />
              </>
            )}
            {!entry.editable && entry.canEdit && (
              <AppButton
                title="Responsable y recordatorio"
                onPress={() => setEditing(!editing)}
              />
            )}
            {editing &&
              (entry.editable ? (
                <AgendaTaskForm
                  key={entry.version}
                  entry={entry}
                  onSaved={() => void saved()}
                />
              ) : (
                <AgendaEntrySettings
                  key={entry.version}
                  entry={entry}
                  onSaved={() => void saved()}
                />
              ))}
            {!entry.editable && (
              <Text>
                La fecha y el estado se modifican desde su módulo de origen.
              </Text>
            )}
            <AppButton
              title="Crear seguimiento"
              onPress={() =>
                router.push({
                  pathname: '/(app)/agenda/new',
                  params: {
                    personType: entry.personType ?? '',
                    personId: entry.personId ?? '',
                    relatedEntryId: entry.id,
                  },
                } as never)
              }
            />
            {person.data && (
              <>
                <Text>{person.data.name}</Text>
                <Text>
                  {person.data.phone} · {person.data.email}
                </Text>
              </>
            )}
            {entry.personId && person.data === null && (
              <Text>La persona ya no está disponible</Text>
            )}
            {entry.personId && (
              <>
                <Text style={{ fontWeight: '600' }}>
                  Seguimiento de la persona
                </Text>
                {related.data?.data.map((task) => (
                  <AppButton
                    key={task.id}
                    title={`${task.title} · ${task.status}`}
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/agenda/[id]',
                        params: { id: task.id },
                      } as never)
                    }
                  />
                ))}
              </>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
