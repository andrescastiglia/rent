import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import { GeoCard } from './geo-card';
import { contactApi } from '@/api/contact-data';
import { getCurrentOrigin } from '@/utils/location';
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user', companyId: 'company' } }),
}));
jest.mock('@/utils/location', () => ({ getCurrentOrigin: jest.fn() }));
jest.mock('@/components/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return Object.fromEntries(
    ['AppButton', 'ChoiceGroup'].map((k) => [
      k,
      (props: object) => React.createElement(k, props),
    ]),
  );
});
const point = {
  type: 'property' as const,
  id: 'home',
  name: 'Casa',
  address: 'Mitre 100',
  latitude: -34,
  longitude: -58,
  precise: true,
};
let app: ReactTestRenderer;
async function render(
  props: React.ComponentProps<typeof GeoCard> = { location: point },
) {
  await act(async () => {
    app = create(<GeoCard {...props} />, {
      createNodeMock: () => ({
        measureInWindow: (
          cb: (x: number, y: number, w: number, h: number) => void,
        ) => cb(0, 0, 390, 200),
      }),
    });
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(500);
  });
}
async function click(title: string) {
  await act(async () => {
    await app.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          (n.props.title === title || n.props.accessibilityLabel === title),
      )[0]
      .props.onPress();
  });
}
const text = () => JSON.stringify(app.toJSON());
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(contactApi, 'config').mockResolvedValue({ maps: true } as never);
  jest.spyOn(contactApi, 'destination').mockResolvedValue(point);
  jest.spyOn(contactApi, 'entry').mockResolvedValue(point);
  jest.spyOn(contactApi, 'image').mockResolvedValue('file:///image.png');
  jest.spyOn(contactApi, 'eta').mockResolvedValue({
    durationSeconds: 120,
    distanceMeters: 1000,
    arrivesAt: '2026-10-03T15:00:00Z',
    mode: 'driving',
    traffic: false,
    attribution: 'Route provider',
  });
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
  });
  (getCurrentOrigin as jest.Mock).mockResolvedValue({
    latitude: -34,
    longitude: -58,
    accuracy: 10,
    timestamp: Date.now(),
  });
  (Linking.openURL as jest.Mock).mockResolvedValue(true);
});
afterEach(async () => {
  if (app) await act(async () => app.unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
it('loads only visible maps, estimates a trip and opens deliberate navigation', async () => {
  await render();
  expect(contactApi.destination).toHaveBeenCalledWith({
    type: 'property',
    id: 'home',
  });
  expect(text()).toContain('Mitre 100');
  await click('Calcular tiempo de llegada');
  expect(text()).toContain('Route provider');
  await act(async () => {
    app.root.findByType('ChoiceGroup' as never).props.onChange('walking');
  });
  expect(contactApi.eta).toHaveBeenLastCalledWith(
    point,
    expect.any(Object),
    'walking',
  );
  await click('Calcular llegada');
  await click('Ir ahí');
  expect(Linking.openURL).toHaveBeenCalledWith(
    expect.stringContaining('travelmode=walking&dir_action=navigate'),
  );
  await act(async () => {
    app.root
      .findAll((n) => (n.type as unknown) === 'Text' && n.props.onPress)[0]
      .props.onPress();
  });
});
it('keeps navigation available after permission denial and image quota exhaustion', async () => {
  (contactApi.image as jest.Mock).mockRejectedValue(new Error('quota'));
  (contactApi.destination as jest.Mock).mockResolvedValue({
    ...point,
    precise: false,
  });
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'denied',
  });
  await render();
  expect(text()).toContain('Ubicación aproximada');
  expect(text()).toContain('Imagen temporalmente');
  await click('Calcular llegada');
  expect(text()).toContain('Podés usar Ir ahí');
  (Linking.openURL as jest.Mock).mockRejectedValueOnce(
    new Error('no native app'),
  );
  await click('Ir ahí');
  expect(Linking.openURL).toHaveBeenCalledTimes(2);
  (Linking.openURL as jest.Mock).mockRejectedValue(new Error('no browser'));
  await click('Ir ahí');
  expect(text()).toContain('No se pudo abrir');
});
it('estimates notification visits automatically and ignores disabled or unavailable maps', async () => {
  await render({ entryId: 'visit:one', autoEstimate: true });
  expect(contactApi.entry).toHaveBeenCalledWith('visit:one');
  expect(contactApi.eta).toHaveBeenCalledTimes(1);
  await act(async () => app.unmount());
  (contactApi.config as jest.Mock).mockResolvedValue({ maps: false });
  await render();
  expect(text()).not.toContain('Mitre 100');
});
it('does not expose optional provider errors or load a destination without a reference', async () => {
  await render({});
  expect(text()).not.toContain('Mitre 100');
  await act(async () => app.unmount());
  (contactApi.config as jest.Mock).mockRejectedValue(new Error('disabled'));
  await render();
  expect(text()).not.toContain('disabled');
});
