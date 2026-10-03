import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as Calendar from 'expo-calendar';
import { agendaApi, type AgendaEntry } from '@/api/agenda';
import {
  calendarEvent,
  disableAgendaCalendar,
  syncAgendaCalendar,
} from '@/calendar/agenda-calendar';
import { addDays, dayInZone } from '../../shared/agenda';
export default function Smoke() {
  const [result, setResult] = useState('Starting native agenda validation');
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_E2E_MODE !== 'true') {
      setResult('Disabled');
      return;
    }
    (async () => {
      const scope = {
          id: '00000000-0000-4000-8000-000000000001',
          companyId: '00000000-0000-4000-8000-000000000002',
        },
        day = addDays(dayInZone(new Date()), 1),
        timezone = 'America/Argentina/Buenos_Aires';
      let records: AgendaEntry[] = [
        {
          id: 'task:00000000-0000-4000-8000-000000000003',
          title: 'Rent native timed probe',
          description: null,
          kind: 'call',
          personType: null,
          personId: null,
          personName: null,
          responsibleUserId: scope.id,
          responsibleName: 'Fixture',
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
          scheduledDate: null,
          endsAt: null,
          reminderMinutes: 15,
          reminderHour: 9,
          reminderAt: null,
          status: 'pending',
          version: '1:0',
          editable: true,
          canEdit: true,
          sourceType: null,
          sourceId: null,
          relatedEntryId: null,
          timezone,
          updatedAt: new Date().toISOString(),
        },
      ];
      records.push({
        ...records[0],
        id: 'task:00000000-0000-4000-8000-000000000004',
        title: 'Rent native date probe',
        scheduledAt: null,
        scheduledDate: day,
      });
      agendaApi.config = async () => ({
        timezone,
        reminderMinutes: 15,
        reminderHour: 9,
      });
      agendaApi.list = async () => ({
        data: records,
        total: records.length,
        page: 1,
        limit: 100,
      });
      try {
        let state = await syncAgendaCalendar(scope, true);
        if (Object.keys(state.events).length !== 2)
          throw new Error('Initial event mapping is incomplete');
        await syncAgendaCalendar(scope);
        const native = await Calendar.getCalendars(Calendar.EntityTypes.EVENT),
          calendar = native.find((c) => c.id === state.calendarId);
        if (!calendar) throw new Error('Dedicated calendar not found');
        let events = await calendar.listEvents(
          new Date(Date.now() - 86400000),
          new Date(Date.now() + 7 * 86400000),
        );
        if (events.length !== 2)
          throw new Error(`Unexpected duplicate count: ${events.length}`);
        const timed = await Calendar.ExpoCalendarEvent.get(
          state.events[records[0].id],
        );
        console.log('NATIVE_TIMED_ALARMS', JSON.stringify(timed.alarms));
        if (!timed?.alarms?.some((a) => a.relativeOffset === -15))
          throw new Error('Timed native alarm differs from Rent');
        const civil = await Calendar.ExpoCalendarEvent.get(
          state.events[records[1].id],
        );
        console.log('NATIVE_DATE_ALARMS', JSON.stringify(civil.alarms));
        const expected = calendarEvent(records[1], scope.id);
        if (
          !civil?.allDay ||
          !civil.alarms?.some(
            (a) => a.relativeOffset === expected.alarms[0].relativeOffset,
          )
        )
          throw new Error('Date-only native event or alarm differs');
        await timed.update({ title: 'External edit' });
        state = await syncAgendaCalendar(scope);
        const restored = await Calendar.ExpoCalendarEvent.get(
          state.events[records[0].id],
        );
        if (restored.title !== 'Rent native timed probe')
          throw new Error('External edit was not restored');
        records = [
          {
            ...records[0],
            scheduledAt: new Date(Date.now() + 7200000).toISOString(),
            version: '2:0',
          },
        ];
        state = await syncAgendaCalendar(scope);
        events = await calendar.listEvents(
          new Date(Date.now() - 86400000),
          new Date(Date.now() + 7 * 86400000),
        );
        if (events.length !== 1) throw new Error('Cancelled event remains');
        setResult(
          'NATIVE_AGENDA_OK · create, deduplicate, alarms, restore, reschedule, cancel',
        );
        console.log('NATIVE_AGENDA_OK');
      } finally {
        await disableAgendaCalendar(scope);
      }
    })().catch((e) => {
      setResult('NATIVE_AGENDA_FAILED ' + e.message);
      console.error(e);
    });
  }, []);
  return (
    <View style={{ padding: 40 }}>
      <Text>{result}</Text>
    </View>
  );
}
