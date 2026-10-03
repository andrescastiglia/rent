import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { syncAgendaCalendar } from '@/calendar/agenda-calendar';
import { Screen } from '@/components/screen';
import { AgendaTaskForm } from '@/screens/agenda-task-form';
export default function Page() {
  const router = useRouter(),
    { user } = useAuth(),
    params = useLocalSearchParams<{
      personType: string;
      personId: string;
      relatedEntryId: string;
    }>();
  return (
    <Screen>
      <AgendaTaskForm
        personType={params.personType}
        personId={params.personId}
        relatedEntryId={params.relatedEntryId}
        onSaved={(id) => {
          if (user) void syncAgendaCalendar(user).catch(() => undefined);
          router.replace({
            pathname: '/(app)/agenda/[id]',
            params: { id },
          } as never);
        }}
      />
    </Screen>
  );
}
