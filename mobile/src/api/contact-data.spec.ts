import { contactApi } from './contact-data';
import { apiClient } from './client';
jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('./env', () => ({
  API_URL: 'https://example.test',
  IS_MOCK_MODE: false,
}));
describe('geographic HTTP contracts', () => {
  it('submits only the entity reference when calculating ETA from an enriched destination', async () => {
    const destination = {
      type: 'property' as const,
      id: 'place',
      name: 'Casa',
      address: 'Mitre 100',
      latitude: -34.6,
      longitude: -58.4,
      precise: true,
    };
    const origin = {
      latitude: -34.7,
      longitude: -58.5,
      accuracy: 10,
      timestamp: Date.now(),
    };
    await contactApi.eta(destination, origin, 'cycling');
    expect(apiClient.post).toHaveBeenCalledWith('/contact-data/eta', {
      destination: { type: 'property', id: 'place' },
      origin,
      mode: 'cycling',
    });
  });
});
it('covers contact search, location, history and arrival routes', async () => {
  const ref = { type: 'property' as const, id: 'home' };
  const address = {
    street: 'Mitre',
    number: '100',
    city: 'CABA',
    state: 'CABA',
    country: 'Argentina',
    postalCode: '',
    confidential: false,
  };
  await contactApi.config();
  await contactApi.places('Mitre');
  await contactApi.phone('11', 'AR');
  await contactApi.search(address);
  await contactApi.destination(ref);
  await contactApi.entry('visit:a/b');
  await contactApi.nearby({
    latitude: 0,
    longitude: 0,
    accuracy: 10,
    timestamp: 1,
  });
  await contactApi.history(ref);
  await contactApi.arrival(ref);
  expect(apiClient.get).toHaveBeenCalledWith(
    '/contact-data/entries/visit%3Aa%2Fb/destination',
  );
  expect(apiClient.post).toHaveBeenCalledWith('/contact-data/address-search', {
    address,
    publicAddress: true,
  });
  expect(apiClient.post).toHaveBeenCalledWith(
    '/contact-data/people/property/home/arrival-opened',
    {},
  );
});
it('loads temporary authenticated map bytes and reports provider failures', async () => {
  const previous = global.fetch;
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new Uint8Array([65, 66]).buffer,
  });
  global.fetch = fetchMock;
  try {
    expect(await contactApi.image({ type: 'property', id: 'home' })).toBe(
      'data:image/jpeg;base64,QUI=',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/contact-data/locations/property/home/image',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
        }),
      }),
    );
    fetchMock.mockResolvedValue({ ok: false });
    await expect(
      contactApi.image({ type: 'owner', id: 'ana' }),
    ).rejects.toThrow('Imagen temporalmente');
  } finally {
    global.fetch = previous;
  }
});
