import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/screen';
import { AppButton } from '@/components/ui';
import { Text, View } from '@/components/themed-native';
import { GeoCard } from '@/components/geo-card';
import { useAuth } from '@/contexts/auth-context';
import { isInternalUser } from '@/config/navigation';
import { contactApi } from '@/api/contact-data';
import {
  whatsappUrl,
  type ContactHistory,
  type NearbyContact,
  type NearbyPlace,
} from '@/api/contact-types';
import {
  currentOrigin,
  disableProximity,
  enableProximity,
  readSnapshot,
  refreshProximity,
  selectProximityContact,
  widgetSupported,
} from '@/proximity/service';
import {
  blankSnapshot,
  chooseImminent,
  type WidgetSnapshot,
} from '../../../shared/proximity';
export default function ProximityPage() {
  const { user } = useAuth(),
    params = useLocalSearchParams<{
      contactId?: string;
      contactType?: string;
      arrival?: string;
    }>();
  const [snapshot, setSnapshot] = useState<WidgetSnapshot>(blankSnapshot()),
    [places, setPlaces] = useState<NearbyPlace[]>([]),
    [imminent, setImminent] = useState<NearbyPlace | null>(null),
    [selected, setSelected] = useState<NearbyContact | null>(null),
    [history, setHistory] = useState<ContactHistory | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [supported, setSupported] = useState(false),
    [enabled, setEnabled] = useState(false),
    [opened, setOpened] = useState(false);
  const [threshold, setThreshold] = useState(100);
  const [preciseOrigin, setPreciseOrigin] = useState(false);
  const revision = useRef(0);
  const arrivalIntent = useRef('');
  useEffect(() => {
    let active = true;
    void widgetSupported().then((s) => {
      if (active) setSupported(s);
    });
    void readSnapshot().then((s) => {
      if (active) setSnapshot(s);
    });
    void contactApi
      .config()
      .then((c) => {
        if (active) setEnabled(c.proximity);
      })
      .catch(() => {});
    const interval = setInterval(
      () =>
        void readSnapshot().then((s) => {
          if (active) setSnapshot(s);
        }),
      30000,
    );
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);
  async function refresh() {
    const origin = await currentOrigin();
    const result = await contactApi.nearby(origin);
    setPlaces(result.places);
    setThreshold(result.imminentRadius);
    setPreciseOrigin(origin.accuracy <= 50);
    const near = chooseImminent(result, snapshot.placeKey, origin.accuracy);
    setImminent(near);
    setSelected(null);
    setHistory(null);
    setOpened(false);
    const person =
      near?.contacts.find(
        (c) => c.id === params.contactId && c.type === params.contactType,
      ) ?? (near?.contacts.length === 1 ? near.contacts[0] : null);
    if (near && person) await select(near, person);
    const next = await refreshProximity();
    setSnapshot(next);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo actualizar la asistencia',
      );
    } finally {
      setBusy(false);
    }
  }
  async function select(place: NearbyPlace, contact: NearbyContact) {
    const version = ++revision.current;
    const h = await contactApi.history(contact);
    const next = await selectProximityContact(place, contact);
    if (revision.current !== version) return;
    setImminent(place);
    setSelected(contact);
    setHistory(h);
    setSnapshot(next);
    setOpened(false);
  }
  async function arrival() {
    if (!selected || !imminent) return;
    const origin = await currentOrigin();
    const nearby = await contactApi.nearby(origin);
    const near = chooseImminent(
      nearby,
      `${imminent.type}:${imminent.id}`,
      origin.accuracy,
    );
    if (
      !near ||
      near.id !== imminent.id ||
      near.type !== imminent.type ||
      !near.contacts.some(
        (c) => c.id === selected.id && c.type === selected.type,
      )
    )
      throw new Error('Confirmá la proximidad antes de avisar.');
    const h = await contactApi.history(selected);
    if (!h.whatsappPhone)
      throw new Error(
        'Completá o normalizá el teléfono desde la ficha antes de abrir WhatsApp.',
      );
    await Linking.openURL(whatsappUrl(h.whatsappPhone, selected.name));
    await contactApi.arrival(selected);
    setOpened(true);
  }
  useEffect(() => {
    if (params.contactId && snapshot.enabled && enabled) void run(refresh);
  }, [params.contactId, enabled, snapshot.enabled]);
  useEffect(() => {
    const key = `${params.contactType}:${params.contactId}`;
    if (
      params.arrival === '1' &&
      !busy &&
      !snapshot.stale &&
      selected &&
      selected.id === params.contactId &&
      selected.type === params.contactType &&
      history?.whatsappPhone &&
      imminent &&
      arrivalIntent.current !== key
    ) {
      arrivalIntent.current = key;
      void run(arrival);
    }
  }, [
    params.arrival,
    params.contactId,
    params.contactType,
    busy,
    snapshot.stale,
    selected,
    history,
    imminent,
  ]);
  if (!user || !isInternalUser(user))
    return (
      <Screen>
        <Text>Función reservada al personal de la empresa.</Text>
      </Screen>
    );
  return (
    <Screen>
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '600' }}>
          Asistencia a visitas
        </Text>
        <Text>
          Activación voluntaria. La ubicación en segundo plano permite
          actualizar el widget. La actualización depende del sistema operativo.
        </Text>
        {!supported && (
          <Text>
            Requiere un nuevo binario Android/iOS. No funciona en Expo Go.
          </Text>
        )}
        {!enabled && <Text>La función todavía no está habilitada.</Text>}
        <AppButton
          title={
            snapshot.enabled
              ? 'Actualizar cercanos'
              : 'Activar asistencia y widget'
          }
          disabled={busy || !enabled || !supported}
          onPress={() =>
            void run(async () => {
              if (!snapshot.enabled) await enableProximity(user);
              await refresh();
            })
          }
        />
        {snapshot.enabled && (
          <AppButton
            title="Desactivar y limpiar widget"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                ++revision.current;
                await disableProximity();
                setSnapshot(blankSnapshot());
                setPlaces([]);
                setSelected(null);
                setHistory(null);
                setImminent(null);
              })
            }
          />
        )}
        <Text>
          {snapshot.updatedAt
            ? `Actualizado ${new Date(snapshot.updatedAt).toLocaleTimeString()}`
            : 'Sin actualización'}
          {snapshot.stale ? ' · Desactualizado' : ''}
        </Text>
        {places.map((p) => (
          <View key={`${p.type}:${p.id}`} style={{ gap: 4 }}>
            <Text>
              {p.name} · {p.address} · {Math.round(p.distance)} m
            </Text>
            {preciseOrigin && p.precise && p.distance <= threshold && (
              <>
                <Text>Estás cerca. Elegí a quién visitar:</Text>
                {p.contacts.map((c) => (
                  <AppButton
                    key={`${c.type}:${c.id}`}
                    title={`${c.name} · ${c.relationship}`}
                    disabled={busy}
                    onPress={() =>
                      void run(() => select(p, c).then(() => undefined))
                    }
                  />
                ))}
              </>
            )}
          </View>
        ))}
        {selected && history && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: '600' }}>{selected.name}</Text>
            <Text>{imminent?.address}</Text>
            <Text>Últimas comunicaciones</Text>
            {history.communications.map((c) => (
              <Text key={`${c.channel}:${c.id}`}>
                {new Date(c.createdAt).toLocaleDateString()} · {c.channel} ·{' '}
                {c.summary}
              </Text>
            ))}
            {!history.communications.length && (
              <Text>No hay comunicaciones registradas.</Text>
            )}
            <AppButton
              title="Avisar que llegué"
              disabled={busy || !history.whatsappPhone}
              onPress={() => void run(arrival)}
            />
            {!history.whatsappPhone && (
              <Text>
                Completá o normalizá el teléfono en la ficha de la persona.
              </Text>
            )}
            {opened && (
              <Text>
                WhatsApp abierto con texto preparado. El envío es manual.
              </Text>
            )}
          </View>
        )}
        {imminent && <GeoCard location={imminent} />}
        <Text>
          Se muestran hasta cinco lugares en el radio configurado. La cercanía
          requiere una ubicación reciente y precisa.
        </Text>
        {error && <Text accessibilityRole="alert">{error}</Text>}
      </View>
    </Screen>
  );
}
