import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { contactApi } from '@/api/contact-data';
import { getCurrentOrigin } from '@/utils/location';
import { updateWidget } from './widget';
import {
  enableProximity,
  disableProximity,
  ensureProximityScope,
  readSnapshot,
  refreshProximity,
  selectProximityContact,
} from './service';
import type { User } from '@/types/auth';
import type { NearbyPlace } from '../../../shared/contact-data';
jest.mock('expo-constants', () => ({
  __esModule: true,
  ExecutionEnvironment: { StoreClient: 'storeClient' },
  default: { executionEnvironment: 'standalone' },
}));
jest.mock('./widget', () => ({
  nativeWidgetAvailable: true,
  updateWidget: jest.fn(),
}));
jest.mock('@/api/contact-data', () => ({
  contactApi: { config: jest.fn(), nearby: jest.fn(), history: jest.fn() },
}));
jest.mock('@/utils/location', () => ({ getCurrentOrigin: jest.fn() }));
const user = {
  id: 'actor',
  companyId: 'company-a',
  role: 'admin',
  roles: ['admin'],
} as User;
const person = {
  type: 'owner' as const,
  id: 'person',
  name: 'Ana Test',
  relationship: 'Propietario',
};
const place: NearbyPlace = {
  type: 'property',
  id: 'place',
  name: 'Casa',
  address: 'Mitre 100',
  latitude: -34.6,
  longitude: -58.4,
  precise: true,
  distance: 30,
  contacts: [person],
};
const snapshotKey = 'rent.proximity.snapshot';
const scopeKey = 'rent.proximity.scope';
describe('consented background visit assistance', () => {
  const storage = new Map<string, string>();
  beforeEach(() => {
    jest.clearAllMocks();
    (TaskManager.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    storage.clear();
    storage.set('rent.auth.token', 'token');
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(
      async (key: string) => storage.get(key) ?? null,
    );
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        storage.set(key, value);
      },
    );
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(
      async (key: string) => {
        storage.delete(key);
      },
    );
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(
      { status: 'granted' },
    );
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue(
      { status: 'granted' },
    );
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(
      true,
    );
    (Location.hasStartedGeofencingAsync as jest.Mock).mockResolvedValue(true);
    (getCurrentOrigin as jest.Mock).mockImplementation(async () => ({
      latitude: -34.6,
      longitude: -58.4,
      accuracy: 10,
      timestamp: Date.now(),
    }));
    (contactApi.config as jest.Mock).mockResolvedValue({
      proximity: true,
      radius: 2000,
      scope: { userId: user.id, companyId: user.companyId },
    });
    (contactApi.nearby as jest.Mock).mockResolvedValue({
      places: [place],
      imminentRadius: 100,
      exitRadius: 150,
    });
    (contactApi.history as jest.Mock).mockResolvedValue({
      communications: [
        {
          id: 'c',
          channel: 'call',
          direction: 'outbound',
          summary: 'Visita confirmada',
          createdAt: new Date().toISOString(),
        },
      ],
      whatsappPhone: '541143215678',
    });
  });
  afterEach(async () => {
    await disableProximity();
  });
  it('requires background permission before saving scope or starting location work', async () => {
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue(
      { status: 'denied' },
    );
    await expect(enableProximity(user)).rejects.toThrow('segundo plano');
    expect(storage.has(scopeKey)).toBe(false);
    expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });
  it('keeps at most twenty geofences and clears contact/CRM data on company changes', async () => {
    (contactApi.nearby as jest.Mock).mockResolvedValue({
      places: Array.from({ length: 25 }, (_, i) => ({
        ...place,
        id: `place-${i}`,
        distance: i ? 1000 : 30,
      })),
      imminentRadius: 100,
      exitRadius: 150,
    });
    await enableProximity(user);
    expect((await readSnapshot()).communications).toHaveLength(1);
    expect(
      (Location.startGeofencingAsync as jest.Mock).mock.calls[0][1],
    ).toHaveLength(20);
    await ensureProximityScope({ ...user, companyId: 'company-b' });
    expect(storage.has(scopeKey)).toBe(false);
    expect(storage.has(snapshotKey)).toBe(false);
    expect(Location.stopLocationUpdatesAsync).toHaveBeenCalled();
    expect(Location.stopGeofencingAsync).toHaveBeenCalled();
    expect(updateWidget).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabled: false,
        contact: null,
        selectedContact: null,
        communications: [],
      }),
    );
  });
  it('preserves the chosen CRM recipient when no valid WhatsApp phone exists', async () => {
    (contactApi.history as jest.Mock).mockResolvedValue({
      communications: [],
      whatsappPhone: null,
    });
    (contactApi.nearby as jest.Mock).mockResolvedValue({
      places: [{ ...place, contacts: [person, { ...person, id: 'other' }] }],
      imminentRadius: 100,
      exitRadius: 150,
    });
    await enableProximity(user);
    expect((await readSnapshot()).selectedContact).toBeNull();
    await selectProximityContact(place, person);
    await refreshProximity();
    expect(await readSnapshot()).toMatchObject({
      title: person.name,
      selectedContact: person,
      contact: null,
    });
  });
  it('shows nearby places without imminent personal details when precision is insufficient', async () => {
    (getCurrentOrigin as jest.Mock).mockResolvedValue({
      latitude: -34.6,
      longitude: -58.4,
      accuracy: 100,
      timestamp: Date.now(),
    });
    await enableProximity(user);
    expect(await readSnapshot()).toMatchObject({
      contact: null,
      selectedContact: null,
      communications: [],
      placeKey: null,
    });
    expect(contactApi.history).not.toHaveBeenCalled();
  });
  it('does not republish private snapshots when disabling during a pending location request', async () => {
    let finish!: (value: unknown) => void, enter!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const waiting = new Promise((resolve) => {
      finish = resolve;
    });
    (contactApi.nearby as jest.Mock).mockImplementation(() => {
      enter();
      return waiting;
    });
    const enabling = enableProximity(user);
    await entered;
    const disabling = disableProximity();
    // Scope deletion must complete before the provider result can return.
    await Promise.resolve();
    await Promise.resolve();
    finish({ places: [place], imminentRadius: 100, exitRadius: 150 });
    await Promise.all([enabling, disabling]);
    expect(storage.has(snapshotKey)).toBe(false);
    expect(storage.has(scopeKey)).toBe(false);
    expect(updateWidget).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabled: false,
        communications: [],
        contact: null,
      }),
    );
  });
});
