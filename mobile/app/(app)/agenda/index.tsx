import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from '@/components/themed-native';
import { Screen } from '@/components/screen';
import { AppButton, Field, ChoiceGroup, DateField } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useQuery } from '@tanstack/react-query';
import { agendaApi } from '@/api/agenda';
import {
  addDays,
  calendarRange,
  dayInZone,
  entryDay,
  isCivilDate,
} from '../../../../shared/agenda';
import {
  calendarState,
  observeAgendaCalendar,
  syncAgendaCalendar,
  disableAgendaCalendar,
} from '@/calendar/agenda-calendar';
export default function AgendaScreen() {
  const { user } = useAuth(),
    router = useRouter();
  const [view, setView] = useState('list'),
    [day, setDay] = useState(dayInZone(new Date())),
    [search, setSearch] = useState(''),
    [kind, setKind] = useState(''),
    [person, setPerson] = useState(''),
    [responsible, setResponsible] = useState(''),
    [status, setStatus] = useState('pending'),
    [page, setPage] = useState(1),
    [error, setError] = useState(''),
    [lastSync, setLastSync] = useState(''),
    [unscheduled, setUnscheduled] = useState(false);
  const internal =
    user &&
    (user.roles?.length ? user.roles : [user.role]).some(
      (r) => r === 'admin' || r === 'staff',
    );
  const config = useQuery({
    queryKey: ['agenda-config', user?.companyId],
    queryFn: () => agendaApi.config(),
    enabled: Boolean(internal),
  });
  useEffect(() => {
    if (config.data) setDay(dayInZone(new Date(), config.data.timezone));
  }, [config.data?.timezone]);
  const range = unscheduled ? null : calendarRange(day, view),
    [personType, personId] = person.split(':');
  const query = useQuery({
    queryKey: [
      'agenda',
      user?.companyId,
      user?.id,
      view,
      day,
      search,
      kind,
      status,
      responsible,
      person,
      page,
      unscheduled,
    ],
    queryFn: () =>
      agendaApi.list({
        page,
        limit: 50,
        status,
        ...range,
        ...(unscheduled ? { unscheduled: 'true' } : {}),
        ...(search ? { search } : {}),
        ...(kind ? { kind } : {}),
        ...(responsible ? { responsibleUserId: responsible } : {}),
        ...(personId ? { personType, personId } : {}),
      }),
    enabled: Boolean(internal),
  });
  const people = useQuery({
      queryKey: ['agenda-people', user?.companyId],
      queryFn: () => agendaApi.people(),
      enabled: Boolean(internal),
    }),
    staff = useQuery({
      queryKey: ['agenda-staff', user?.companyId],
      queryFn: () => agendaApi.staff(),
      enabled: Boolean(internal),
    });
  useEffect(() => {
    let active = true;
    const stop = user
      ? observeAgendaCalendar(user, (s) => {
          if (active) setLastSync(s.lastSync ?? '');
        })
      : undefined;
    if (user)
      calendarState(user)
        .then((s) => {
          if (active) setLastSync(s.lastSync ?? '');
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
      stop?.();
    };
  }, [user]);
  if (!internal)
    return (
      <Screen>
        <Text>Agenda reservada al personal interno</Text>
      </Screen>
    );
  const options = (values: string[]) =>
    values.map((value) => ({
      value,
      label:
        (
          {
            list: 'Lista',
            day: 'Día',
            week: 'Semana',
            month: 'Mes',
            pending: 'Pendiente',
            completed: 'Completado',
            cancelled: 'Cancelado',
            all: 'Todos',
          } as Record<string, string>
        )[value] ?? value,
    }));
  return (
    <Screen>
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>
          Agenda de la empresa
        </Text>
        <AppButton
          title="Nueva tarea"
          onPress={() => router.push('/(app)/agenda/new' as never)}
        />
        <ChoiceGroup
          label="Vista"
          value={view}
          options={options(['list', 'day', 'week', 'month'])}
          onChange={(v) => {
            setView(v);
            setUnscheduled(false);
            setPage(1);
          }}
        />
        <DateField
          label="Fecha"
          value={day}
          onChange={(v) => {
            if (isCivilDate(v)) setDay(v);
            setPage(1);
          }}
        />
        <AppButton
          title="Por programar"
          onPress={() => {
            setUnscheduled(!unscheduled);
            setPage(1);
          }}
        />
        <Field
          label="Buscar"
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <ChoiceGroup
          label="Tipo"
          value={kind}
          options={[
            { value: '', label: 'Todos' },
            ...options([
              'task',
              'call',
              'visit',
              'maintenance',
              'lease',
              'invoice',
              'sale',
            ]),
          ]}
          onChange={(v) => {
            setKind(v);
            setPage(1);
          }}
        />
        <ChoiceGroup
          label="Estado"
          value={status}
          options={options(['pending', 'completed', 'cancelled', 'all'])}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <ChoiceGroup
          label="Responsable"
          value={responsible}
          options={[
            { value: '', label: 'Todos' },
            { value: 'unassigned', label: 'Sin responsable' },
            ...(staff.data ?? []).map((s) => ({ value: s.id, label: s.name })),
          ]}
          onChange={(v) => {
            setResponsible(v);
            setPage(1);
          }}
        />
        <ChoiceGroup
          label="Persona"
          value={person}
          options={[
            { value: '', label: 'Todas' },
            ...(people.data ?? []).map((p) => ({
              value: `${p.personType}:${p.personId}`,
              label: `${p.name} · ${p.personType}`,
            })),
          ]}
          onChange={(v) => {
            setPerson(v);
            setPage(1);
          }}
        />
        <AppButton
          title="Actualizar agenda y calendario"
          onPress={() => {
            void query.refetch();
            void syncAgendaCalendar(user)
              .then((s) => setLastSync(s.lastSync ?? 'Calendario desactivado'))
              .catch((e) => setError(e.message));
          }}
        />
        <AppButton
          title="Activar calendario y recordatorios"
          onPress={() =>
            void syncAgendaCalendar(user, true)
              .then((s) => setLastSync(s.lastSync ?? ''))
              .catch((e) => setError(e.message))
          }
        />
        <AppButton
          title="Desactivar calendario"
          onPress={() =>
            void disableAgendaCalendar(user)
              .then(() => setLastSync('Desactivado'))
              .catch((e) => setError(e.message))
          }
        />
        {lastSync && <Text>Última sincronización: {lastSync}</Text>}
        {error && <Text accessibilityRole="alert">{error}</Text>}
        {query.error && (
          <Text accessibilityRole="alert">{query.error.message}</Text>
        )}
        {query.isFetching && <Text>Cargando…</Text>}
        {(!range ? query.data?.data : [])?.map((e) => (
          <View
            key={e.id}
            style={{ borderWidth: 1, borderColor: '#888', padding: 10, gap: 6 }}
          >
            <Text>
              {entryDay(e) ?? 'Por programar'} · {e.personName ?? 'Sin persona'}{' '}
              · {e.responsibleName || 'Sin responsable'}
            </Text>
            <AppButton
              title={e.title}
              onPress={() =>
                router.push({
                  pathname: '/(app)/agenda/[id]',
                  params: { id: e.id },
                } as never)
              }
            />
          </View>
        ))}
        {range && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {Array.from(
              {
                length:
                  Math.round(
                    (Date.parse(range.to) - Date.parse(range.from)) / 86400000,
                  ) + 1,
              },
              (_, i) => addDays(range.from, i),
            ).map((d) => (
              <View
                key={d}
                style={{
                  width:
                    view === 'day' ? '100%' : view === 'week' ? '100%' : '31%',
                  minHeight: 90,
                  borderWidth: 1,
                  borderColor: '#888',
                  padding: 4,
                  gap: 4,
                }}
              >
                <Text>
                  {new Intl.DateTimeFormat('es-AR', {
                    timeZone: 'UTC',
                    weekday: 'short',
                    day: 'numeric',
                  }).format(new Date(`${d}T12:00:00Z`))}
                </Text>
                {query.data?.data
                  .filter((e) => entryDay(e) === d)
                  .map((e) => (
                    <AppButton
                      key={e.id}
                      title={e.title}
                      onPress={() =>
                        router.push({
                          pathname: '/(app)/agenda/[id]',
                          params: { id: e.id },
                        } as never)
                      }
                    />
                  ))}
              </View>
            ))}
          </View>
        )}
        <AppButton
          title="Anterior"
          disabled={page === 1}
          onPress={() => setPage(page - 1)}
        />
        <Text>
          Página {page} · {query.data?.total ?? 0} compromisos
        </Text>
        <AppButton
          title="Siguiente"
          disabled={!query.data || page * 50 >= query.data.total}
          onPress={() => setPage(page + 1)}
        />
      </View>
    </Screen>
  );
}
