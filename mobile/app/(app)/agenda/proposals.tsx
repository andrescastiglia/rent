import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { authApi } from '@/api/auth';
import { useAuth } from '@/contexts/auth-context';
import { Text, View } from '@/components/themed-native';
import { Screen } from '@/components/screen';
import { AppButton, Field } from '@/components/ui';
import { syncAgendaCalendar } from '@/calendar/agenda-calendar';
type Proposal = {
  id: string;
  summary: string;
  status: string;
  payload: Record<string, unknown>;
  requestedByName: string;
  expiresAt: string;
  canRetry: boolean;
};
export default function Page() {
  const { user } = useAuth(),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['agenda-proposals', user?.companyId, user?.id],
    queryFn: () => apiClient.get<Proposal[]>('/pending-actions'),
  });
  async function review(id: string, approve: boolean) {
    setBusy(true);
    setError('');
    try {
      if (approve) {
        const reauthToken = await authApi.reauthenticate(password);
        setPassword('');
        const result = await apiClient.post<{
          status: string;
          errorMessage?: string;
        }>(`/pending-actions/${id}/approve`, { reauthToken });
        if (result.status !== 'executed')
          throw new Error(
            result.errorMessage ?? 'La propuesta no fue ejecutada',
          );
        if (user)
          try {
            await syncAgendaCalendar(user);
          } catch (e) {
            setError(
              'Propuesta ejecutada. ' +
                (e instanceof Error
                  ? e.message
                  : 'No se pudo actualizar el calendario'),
            );
          }
      } else await apiClient.post(`/pending-actions/${id}/reject`, {});
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revisar');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '600' }}>
          Propuestas pendientes
        </Text>
        {error && <Text accessibilityRole="alert">{error}</Text>}
        {query.error && (
          <Text accessibilityRole="alert">{query.error.message}</Text>
        )}
        <Field
          label="Contraseña para reautenticar"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        {query.data
          ?.filter((p) => p.status === 'pending' || p.canRetry)
          .map((p) => (
            <View key={p.id} style={{ gap: 8, borderWidth: 1, padding: 10 }}>
              <Text>{p.summary}</Text>
              <Text>
                Solicitado por {p.requestedByName} · Vence {p.expiresAt}
              </Text>
              {Object.entries(p.payload)
                .filter(([k]) => !k.toLowerCase().includes('token'))
                .map(([key, value]) => (
                  <Text key={key}>
                    {key}:{' '}
                    {typeof value === 'object'
                      ? JSON.stringify(value)
                      : String(value ?? 'Sin especificar')}
                  </Text>
                ))}
              <AppButton
                title="Aprobar"
                disabled={busy || !password}
                onPress={() => void review(p.id, true)}
              />
              <AppButton
                title="Rechazar"
                disabled={busy}
                onPress={() => void review(p.id, false)}
              />
            </View>
          ))}
      </View>
    </Screen>
  );
}
