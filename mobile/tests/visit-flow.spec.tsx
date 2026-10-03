import { QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Proximity from '../app/(app)/proximity';
import { ContactTools } from '@/components/contact-tools';
import { LocationPicker } from '@/components/location-picker';
import { contactApi } from '@/api/contact-data';
import * as proximity from '@/proximity/service';
import { blankSnapshot } from '../../shared/proximity';
import { cleanup, renderApp, settle, textContent } from './render';
let mockUser = {
  id: 'user',
  companyId: 'company',
  role: 'admin',
  roles: [] as string[],
};
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.mock('@/components/screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/components/ui', () => {
  const React = require('react');
  return Object.fromEntries(
    ['AppButton', 'Field', 'ChoiceGroup'].map((name) => [
      name,
      (props: object) => React.createElement(name, props),
    ]),
  );
});
jest.mock('@/components/geo-card', () => ({ GeoCard: () => null }));
jest.mock('@/proximity/service', () =>
  Object.fromEntries(
    [
      'currentOrigin',
      'disableProximity',
      'enableProximity',
      'readSnapshot',
      'refreshProximity',
      'selectProximityContact',
      'widgetSupported',
    ].map((k) => [k, jest.fn()]),
  ),
);
const contact = {
  type: 'owner' as const,
  id: 'ana',
  name: 'Ana',
  relationship: 'Propietaria',
};
const place = {
  type: 'property' as const,
  id: 'home',
  name: 'Casa',
  address: 'Mitre 100',
  latitude: -34,
  longitude: -58,
  precise: true,
  distance: 10,
  contacts: [contact],
};
const address = {
  street: 'Mitre',
  number: '100',
  city: 'Buenos Aires',
  state: 'CABA',
  country: 'Argentina',
  postalCode: '1000',
  floor: '',
  apartment: '',
  confidential: false,
};
async function click(app: ReactTestRenderer, title: string) {
  await act(async () => {
    await app.root
      .findAll(
        (n) => (n.type as unknown) === 'AppButton' && n.props.title === title,
      )[0]
      .props.onPress();
  });
  await settle();
}
async function change(app: ReactTestRenderer, label: string, value: string) {
  await act(async () => {
    const n = app.root.findAll(
      (n) => typeof n.type === 'string' && n.props.label === label,
    )[0];
    (n.props.onChangeText ?? n.props.onChange)(value);
  });
  await settle();
}
beforeEach(() => {
  mockUser = { id: 'user', companyId: 'company', role: 'admin', roles: [] };
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  jest.spyOn(contactApi, 'config').mockResolvedValue({
    normalization: true,
    maps: true,
    proximity: true,
  } as never);
  jest.spyOn(contactApi, 'nearby').mockResolvedValue({
    places: [place],
    imminentRadius: 100,
    exitRadius: 150,
  });
  jest.spyOn(contactApi, 'history').mockResolvedValue({
    whatsappPhone: '+5491100000000',
    communications: [
      {
        id: 'comm',
        channel: 'call',
        direction: 'outbound',
        summary: 'Visit agreed',
        createdAt: '2026-10-03',
      },
    ],
  });
  jest.spyOn(contactApi, 'arrival').mockResolvedValue({} as never);
  (proximity.widgetSupported as jest.Mock).mockResolvedValue(true);
  (proximity.readSnapshot as jest.Mock).mockResolvedValue(blankSnapshot());
  (proximity.refreshProximity as jest.Mock).mockResolvedValue({
    ...blankSnapshot(true),
    stale: false,
    updatedAt: Date.now(),
  });
  (proximity.selectProximityContact as jest.Mock).mockResolvedValue({
    ...blankSnapshot(true),
    stale: false,
    contact,
  });
  (proximity.currentOrigin as jest.Mock).mockResolvedValue({
    latitude: -34,
    longitude: -58,
    accuracy: 10,
    timestamp: Date.now(),
  });
  (proximity.enableProximity as jest.Mock).mockResolvedValue(undefined);
  (proximity.disableProximity as jest.Mock).mockResolvedValue(undefined);
});
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
it('activates assistance voluntarily, selects a precise nearby contact and opens an arrival draft', async () => {
  const app = await renderApp(<Proximity />);
  await click(app, 'Activar asistencia y widget');
  expect(proximity.enableProximity).toHaveBeenCalledWith(mockUser);
  expect(textContent(app)).toContain('Visit agreed');
  await click(app, 'Ana · Propietaria');
  await click(app, 'Avisar que llegué');
  expect(Linking.openURL).toHaveBeenCalledWith(
    expect.stringContaining('wa.me'),
  );
  expect(contactApi.arrival).toHaveBeenCalledWith(contact);
  expect(textContent(app)).toContain('envío es manual');
  await click(app, 'Actualizar cercanos');
  await click(app, 'Desactivar y limpiar widget');
  expect(proximity.disableProximity).toHaveBeenCalled();
  expect(textContent(app)).not.toContain('Visit agreed');
});
it('requires precise proximity and a normalized phone before opening WhatsApp', async () => {
  const app = await renderApp(<Proximity />);
  await click(app, 'Activar asistencia y widget');
  (contactApi.nearby as jest.Mock).mockResolvedValue({
    places: [],
    imminentRadius: 100,
    exitRadius: 150,
  });
  await click(app, 'Avisar que llegué');
  expect(textContent(app)).toContain('Confirmá la proximidad');
  expect(contactApi.arrival).not.toHaveBeenCalled();
  (contactApi.nearby as jest.Mock).mockResolvedValue({
    places: [place],
    imminentRadius: 100,
    exitRadius: 150,
  });
  (contactApi.history as jest.Mock).mockResolvedValue({
    whatsappPhone: null,
    communications: [],
  });
  await click(app, 'Actualizar cercanos');
  expect(textContent(app)).toContain('No hay comunicaciones registradas');
  expect(textContent(app)).toContain('normalizá el teléfono');
});
it('handles arrival links once and shows failed activation or provider requests', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    contactId: 'ana',
    contactType: 'owner',
    arrival: '1',
  });
  (proximity.readSnapshot as jest.Mock).mockResolvedValue({
    ...blankSnapshot(true),
    stale: false,
  });
  const app = await renderApp(<Proximity />);
  await settle();
  await settle();
  expect(contactApi.arrival).toHaveBeenCalledTimes(1);
  (proximity.currentOrigin as jest.Mock).mockRejectedValue('offline');
  await click(app, 'Actualizar cercanos');
  expect(textContent(app)).toContain('No se pudo actualizar');
});
it('hides assistance from external users and reports missing binary/feature', async () => {
  mockUser.role = 'owner';
  const app = await renderApp(<Proximity />);
  expect(textContent(app)).toContain('Función reservada');
  await cleanup();
  mockUser.role = 'admin';
  (proximity.widgetSupported as jest.Mock).mockResolvedValue(false);
  (contactApi.config as jest.Mock).mockResolvedValue({ proximity: false });
  const disabled = await renderApp(<Proximity />);
  expect(textContent(disabled)).toContain('nuevo binario');
  expect(textContent(disabled)).toContain('no está habilitada');
});
it('normalizes phones only after explicit acceptance and discards stale previews', async () => {
  const onChange = jest.fn();
  jest.spyOn(contactApi, 'phone').mockResolvedValue({
    original: '11',
    valid: true,
    possible: true,
    country: 'AR',
    international: '+54 11',
    e164: '+5411',
    extension: null,
  });
  const app = await renderApp(
    <ContactTools value={{}} onChange={onChange} phones={{ phone: '11' }} />,
  );
  await change(app, 'País del teléfono', 'UY');
  await change(app, 'Código de país telefónico (ISO)', 'ar');
  await click(app, 'Normalizar teléfono');
  expect(contactApi.phone).toHaveBeenCalledWith('11', 'AR');
  await click(app, 'Aceptar teléfono');
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      normalization: {
        phones: { phone: 'AR' },
        phoneOriginals: { phone: '11' },
      },
    }),
  );
  await click(app, 'Normalizar teléfono');
  await act(async () =>
    app.update(
      <QueryClientProvider
        client={app.root.findByType(QueryClientProvider).props.client}
      >
        <ContactTools value={{}} onChange={onChange} phones={{ phone: '22' }} />
      </QueryClientProvider>,
    ),
  );
  await click(app, 'Aceptar teléfono');
  expect(textContent(app)).toContain('teléfono cambió');
});
it.each([true, false])(
  'keeps invalid telephone input unchanged (possible=%s)',
  async (possible) => {
    jest.spyOn(contactApi, 'phone').mockResolvedValue({
      original: '11',
      valid: false,
      possible,
      country: 'AR',
      international: null,
      e164: null,
      extension: null,
    });
    const onChange = jest.fn();
    const app = await renderApp(
      <ContactTools
        value={{}}
        onChange={onChange}
        phones={{ ownerWhatsapp: '11', emergencyContactPhone: '' }}
      />,
    );
    await click(app, 'Normalizar teléfono');
    expect(textContent(app)).toContain(
      possible ? 'Número posible' : 'Número incompleto',
    );
    expect(onChange).not.toHaveBeenCalled();
  },
);
it('requires public address consent, accepts a candidate and invalidates it after an address edit', async () => {
  const onChange = jest.fn();
  jest.spyOn(contactApi, 'search').mockResolvedValue({
    candidates: [{ token: 'proof', label: 'Mitre 100', precise: false }],
  } as never);
  const app = await renderApp(
    <ContactTools
      value={{}}
      onChange={onChange}
      address={address}
      editAddress
    />,
  );
  await change(
    app,
    'Dirección pública, sin datos personales ni confidenciales',
    'yes',
  );
  await click(app, 'Normalizar dirección');
  await click(app, 'Mitre 100 · ubicación aproximada');
  expect(onChange).toHaveBeenCalledWith({
    normalization: { addressToken: 'proof' },
  });
  await act(async () =>
    app.update(
      <QueryClientProvider
        client={app.root.findByType(QueryClientProvider).props.client}
      >
        <ContactTools
          value={{ normalization: { addressToken: 'proof' } }}
          onChange={onChange}
          address={{ ...address, street: 'Belgrano' }}
          editAddress
        />
      </QueryClientProvider>,
    ),
  );
  expect(onChange).toHaveBeenLastCalledWith({
    normalization: { addressToken: undefined },
  });
  await change(app, 'Calle', 'Otra');
  await change(app, 'Piso', '2');
  await change(app, 'Departamento', 'A');
  await change(app, 'Domicilio confidencial', 'yes');
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      contactAddress: expect.objectContaining({ confidential: true }),
    }),
  );
});
it('shows empty candidate results and provider errors without blocking manual input', async () => {
  jest
    .spyOn(contactApi, 'search')
    .mockResolvedValue({ candidates: [] } as never);
  jest.spyOn(contactApi, 'phone').mockRejectedValue('offline');
  const app = await renderApp(
    <ContactTools
      value={{}}
      onChange={jest.fn()}
      address={address}
      phones={{ phone: '11' }}
    />,
  );
  await change(
    app,
    'Dirección pública, sin datos personales ni confidenciales',
    'yes',
  );
  await click(app, 'Normalizar dirección');
  expect(textContent(app)).toContain('No se encontraron direcciones');
  await click(app, 'Normalizar teléfono');
  expect(textContent(app)).toContain('No se pudo normalizar');
});
it('selects registered destinations and supports address fallback', async () => {
  const onChange = jest.fn();
  jest.spyOn(contactApi, 'places').mockResolvedValue([place]);
  const app = await renderApp(
    <LocationPicker value={{ type: 'owner', id: 'old' }} onChange={onChange} />,
  );
  expect(app.root.findByType('ChoiceGroup' as never).props.options).toEqual(
    expect.arrayContaining([
      { value: 'owner:old', label: 'Destino registrado' },
    ]),
  );
  await change(app, 'Buscar lugar registrado', 'Mitre');
  await click(app, 'Buscar lugares');
  await change(app, 'Lugar registrado', 'property:home');
  expect(onChange).toHaveBeenLastCalledWith({ type: 'property', id: 'home' });
  await change(app, 'Lugar registrado', '');
  expect(onChange).toHaveBeenLastCalledWith(null);
  (contactApi.places as jest.Mock).mockRejectedValue(new Error('offline'));
  await click(app, 'Buscar lugares');
  expect(textContent(app)).toContain('No se pudieron cargar');
});
