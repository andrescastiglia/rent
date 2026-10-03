import { getCurrentOrigin } from '@/utils/location';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { contactApi } from '@/api/contact-data';
import { getToken, setTokenBackgroundAccess } from '@/storage/auth-storage';
import type { User } from '@/types/auth';
import { isInternalUser } from '@/config/navigation';
import {
  blankSnapshot,
  chooseImminent,
  expireSnapshot,
  type WidgetSnapshot,
} from '../../../shared/proximity';
import type {
  GeoOrigin,
  NearbyContact,
  NearbyPlace,
} from '../../../shared/contact-data';
const SETTINGS = 'rent.proximity.scope',
  SNAPSHOT = 'rent.proximity.snapshot';
const LOCATION_TASK = 'rent.proximity.locations',
  FENCE_TASK = 'rent.proximity.geofences';
type Scope = { userId: string; companyId: string; generation: string };
let updating: Promise<WidgetSnapshot> | null = null;
let publishing: Promise<void> = Promise.resolve();
async function scope(): Promise<Scope | null> {
  const value = await SecureStore.getItemAsync(SETTINGS);
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
async function native() {
  if (
    Platform.OS === 'web' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  )
    return null;
  return import('./widget');
}
export async function widgetSupported() {
  try {
    return (await native())?.nativeWidgetAvailable ?? false;
  } catch {
    return false;
  }
}
export async function readSnapshot(): Promise<WidgetSnapshot> {
  const value = await SecureStore.getItemAsync(SNAPSHOT);
  try {
    const snapshot: WidgetSnapshot = value
      ? JSON.parse(value)
      : blankSnapshot();
    return snapshot.expiresAt < Date.now()
      ? expireSnapshot(snapshot)
      : snapshot;
  } catch {
    return blankSnapshot();
  }
}
async function publish(snapshot: WidgetSnapshot, expected?: Scope) {
  const work = publishing
    .catch(() => undefined)
    .then(async () => {
      const widget = await native();
      if (expected && (await scope())?.generation !== expected.generation)
        return;
      await SecureStore.setItemAsync(SNAPSHOT, JSON.stringify(snapshot), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      if (expected && (await scope())?.generation !== expected.generation)
        return;
      widget?.updateWidget(snapshot);
    });
  publishing = work;
  return work;
}
export async function ensureProximityScope(user: User | null) {
  const current = await scope();
  if (
    current &&
    (!user ||
      current.userId !== user.id ||
      current.companyId !== user.companyId ||
      !isInternalUser(user))
  )
    await disableProximity();
  else if (current) await setTokenBackgroundAccess(true);
}
export async function disableProximity() {
  const oldScope = await scope();
  await SecureStore.deleteItemAsync(SETTINGS);
  if (updating) await updating.catch(() => undefined);
  await Promise.all([
    Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)
      .then((started) =>
        started ? Location.stopLocationUpdatesAsync(LOCATION_TASK) : undefined,
      )
      .catch(() => undefined),
    Location.hasStartedGeofencingAsync(FENCE_TASK)
      .then((started) =>
        started ? Location.stopGeofencingAsync(FENCE_TASK) : undefined,
      )
      .catch(() => undefined),
  ]);
  await publishing.catch(() => undefined);
  await SecureStore.deleteItemAsync(SNAPSHOT);
  if (oldScope) await setTokenBackgroundAccess(false);
  try {
    (await native())?.updateWidget(blankSnapshot());
  } catch {
    /* A binary without the widget can still sign out. */
  }
}
export async function enableProximity(user: User) {
  if (!user.companyId || !isInternalUser(user))
    throw new Error('Función reservada al personal');
  if (!(await widgetSupported()))
    throw new Error(
      'El widget requiere un nuevo binario; no funciona en Expo Go.',
    );
  if (!(await contactApi.config()).proximity)
    throw new Error('La asistencia a visitas todavía no está habilitada.');
  if (!(await TaskManager.isAvailableAsync()))
    throw new Error('El dispositivo no permite tareas en segundo plano.');
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted')
    throw new Error('Se necesita permiso de ubicación.');
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted')
    throw new Error(
      'Activá el permiso de ubicación en segundo plano para usar el widget.',
    );
  await disableProximity();
  const next: Scope = {
    userId: user.id,
    companyId: user.companyId,
    generation: `${Date.now()}:${Math.random()}`,
  };
  await setTokenBackgroundAccess(true);
  await SecureStore.setItemAsync(SETTINGS, JSON.stringify(next), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 50,
      timeInterval: 60000,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Asistencia a visitas',
        notificationBody: 'Buscando lugares registrados cercanos',
        killServiceOnDestroy: true,
      },
    });
    await publish(blankSnapshot(true), next);
    await refreshProximity();
  } catch (error) {
    await disableProximity();
    throw error;
  }
}
async function process(origin: GeoOrigin): Promise<WidgetSnapshot> {
  const current = await scope();
  if (!current || !(await getToken())) return blankSnapshot();
  const config = await contactApi.config();
  if (
    !config.proximity ||
    config.scope?.userId !== current.userId ||
    config.scope?.companyId !== current.companyId
  ) {
    await SecureStore.deleteItemAsync(SETTINGS);
    await setTokenBackgroundAccess(false);
    await publish(blankSnapshot());
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(
      () => undefined,
    );
    await Location.stopGeofencingAsync(FENCE_TASK).catch(() => undefined);
    return blankSnapshot();
  }
  const previous = await readSnapshot();
  if (Date.now() - origin.timestamp > 120000 || origin.accuracy > 200) {
    const stale = expireSnapshot(previous);
    await publish(stale, current);
    return stale;
  }
  const result = await contactApi.nearby(
    origin,
    20,
    Math.max(2000, config.radius),
  );
  const imminent = chooseImminent(result, previous.placeKey, origin.accuracy);
  const previousContact = previous.selectedContact ?? previous.contact;
  const preferred = imminent?.contacts.find(
    (c) =>
      previousContact &&
      c.id === previousContact.id &&
      c.type === previousContact.type,
  );
  const contact =
    preferred ??
    (imminent?.contacts.length === 1 ? imminent.contacts[0] : null);
  let history = null;
  try {
    history = contact ? await contactApi.history(contact) : null;
  } catch {
    /* A CRM failure leaves the nearby places usable. */
  }
  const snapshot: WidgetSnapshot = {
    enabled: true,
    stale: false,
    updatedAt: origin.timestamp,
    expiresAt: origin.timestamp + 300000,
    title: contact?.name ?? imminent?.name ?? 'Lugares cercanos',
    address: imminent?.address ?? 'Hasta cinco lugares registrados',
    placeKey: imminent ? `${imminent.type}:${imminent.id}` : null,
    contact: history?.whatsappPhone ? contact : null,
    selectedContact: contact,
    communications: (history?.communications ?? []).map((c) => ({
      ...c,
      summary: c.summary.slice(0, 160),
    })),
    lines: imminent
      ? imminent.contacts.length > 1 && !contact
        ? [
            'Abrí Rent para elegir el destinatario',
            ...imminent.contacts
              .map((c) => `${c.name} · ${c.relationship}`)
              .slice(0, 4),
          ]
        : [contact?.relationship ?? 'Sin contacto asociado']
      : result.places
          .filter((p) => p.distance <= config.radius)
          .slice(0, 5)
          .map((p) => `${p.name} · ${p.address} · ${Math.round(p.distance)} m`),
  };
  await publish(snapshot, current);
  if ((await scope())?.generation === current.generation) {
    const regions = result.places.slice(0, 20).map((p) => ({
      identifier: `${p.type}:${p.id}`,
      latitude: p.latitude,
      longitude: p.longitude,
      radius: result.exitRadius,
      notifyOnEnter: true,
      notifyOnExit: true,
    }));
    if (regions.length)
      await Location.startGeofencingAsync(FENCE_TASK, regions);
    else if (await Location.hasStartedGeofencingAsync(FENCE_TASK))
      await Location.stopGeofencingAsync(FENCE_TASK);
  }
  return snapshot;
}
async function update(origin: GeoOrigin) {
  if (updating) return updating;
  updating = process(origin);
  try {
    return await updating;
  } catch (error) {
    const current = await scope();
    if (current) await publish(expireSnapshot(await readSnapshot()), current);
    throw error;
  } finally {
    updating = null;
  }
}
export const currentOrigin = getCurrentOrigin;
export async function refreshProximity() {
  if (!(await scope())) return blankSnapshot();
  return update(await currentOrigin());
}
export async function selectProximityContact(
  place: NearbyPlace,
  contact: NearbyContact,
) {
  const current = await scope();
  if (!current) throw new Error('Activá la asistencia a visitas');
  const origin = await currentOrigin();
  const result = await contactApi.nearby(origin, 20);
  const imminent = chooseImminent(
    result,
    `${place.type}:${place.id}`,
    origin.accuracy,
  );
  if (
    !imminent ||
    imminent.id !== place.id ||
    imminent.type !== place.type ||
    !imminent.contacts.some(
      (c) => c.id === contact.id && c.type === contact.type,
    )
  )
    throw new Error('La cercanía no está confirmada. Actualizá la ubicación.');
  const history = await contactApi.history(contact);
  const snapshot: WidgetSnapshot = {
    enabled: true,
    stale: false,
    updatedAt: origin.timestamp,
    expiresAt: origin.timestamp + 300000,
    title: contact.name,
    address: place.address,
    placeKey: `${place.type}:${place.id}`,
    contact: history.whatsappPhone ? contact : null,
    selectedContact: contact,
    communications: history.communications.map((c) => ({
      ...c,
      summary: c.summary.slice(0, 160),
    })),
    lines: [contact.relationship],
  };
  await publish(snapshot, current);
  return snapshot;
}
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const p = data.locations[data.locations.length - 1];
    try {
      await update({
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        accuracy: p.coords.accuracy ?? 10000,
        timestamp: p.timestamp,
      });
    } catch {
      /* The next system update retries without logging location. */
    }
  },
);
TaskManager.defineTask(FENCE_TASK, async ({ error }) => {
  if (error) return;
  try {
    await refreshProximity();
  } catch {
    /* Do not retain journeys or log coordinates. */
  }
});
