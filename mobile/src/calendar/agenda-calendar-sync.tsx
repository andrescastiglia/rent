import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { syncAgendaCalendar } from './agenda-calendar';
export function AgendaCalendarSync() {
  const { user } = useAuth();
  useEffect(() => {
    if (
      !user ||
      !(user.roles?.length ? user.roles : [user.role]).some(
        (r) => r === 'admin' || r === 'staff',
      )
    )
      return;
    const run = () => void syncAgendaCalendar(user).catch(() => undefined);
    run();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => subscription.remove();
  }, [user]);
  return null;
}
