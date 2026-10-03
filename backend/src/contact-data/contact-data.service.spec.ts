import { DataSource } from 'typeorm';
import { ContactDataService } from './contact-data.service';
import { contactAddressSchema } from './contact-data.dto';
const actor = { id: 'a', companyId: 'company-a', role: 'admin' };
const place = {
  id: '11111111-1111-4111-8111-111111111111',
  latitude: -34.6,
  longitude: -58.4,
  name: 'Place',
  address_street: 'Mitre',
  address_city: 'Buenos Aires',
  contact_data: {},
};
const ref = { type: 'property' as const, id: place.id };
describe('public geographic services', () => {
  let query: jest.Mock, service: ContactDataService;
  const originalFetch = global.fetch;
  beforeEach(() => {
    query = jest.fn();
    service = new ContactDataService({ query } as unknown as DataSource);
    process.env.CONTACT_NORMALIZATION_ENABLED = 'true';
    process.env.GEO_MAPS_ENABLED = 'true';
    process.env.GEO_PROXIMITY_ENABLED = 'true';
    process.env.GEO_USER_AGENT = 'RentTest/1.0 (https://example.com/support)';
    process.env.CONTACT_DATA_SIGNING_SECRET = 'test';
    global.fetch = jest.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    for (const key of [
      'CONTACT_NORMALIZATION_ENABLED',
      'GEO_MAPS_ENABLED',
      'GEO_PROXIMITY_ENABLED',
      'GEO_USER_AGENT',
      'CONTACT_DATA_SIGNING_SECRET',
      'ARCGIS_STATIC_MAPS_KEY',
      'ARCGIS_PAYG_DISABLED',
    ])
      delete process.env[key];
  });
  it('never submits confidential addresses or personal/unit fields', async () => {
    const address = contactAddressSchema.parse({
      street: 'Mitre',
      number: '100',
      city: 'Buenos Aires',
      floor: '2',
      apartment: 'B',
    });
    await expect(
      service.search(actor, {
        address: { ...address, confidential: true },
        publicAddress: true,
      }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ requests: 1 }])
      .mockResolvedValueOnce([]);
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          lat: '-34.6',
          lon: '-58.4',
          display_name: 'Mitre 100',
          address: { house_number: '100' },
          osm_type: 'node',
          osm_id: 1,
        },
      ],
    });
    const result = await service.search(actor, {
      address,
      publicAddress: true,
    });
    expect(result.candidates[0]).toMatchObject({
      label: 'Mitre 100',
      precise: true,
    });
    const url = new URL((fetch as jest.Mock).mock.calls[0][0]);
    expect(url.searchParams.get('street')).toBe('100 Mitre');
    expect(url.searchParams.has('floor')).toBe(false);
    expect(url.searchParams.has('apartment')).toBe(false);
  });
  it('rejects new Nominatim calls while the global slot is reserved', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(
      service.search(actor, {
        address: contactAddressSchema.parse({
          street: 'Mitre',
          city: 'Buenos Aires',
        }),
        publicAddress: true,
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetch).not.toHaveBeenCalled();
    expect(query.mock.calls[1][0]).toContain("interval '1 second'");
  });
  it('reuses cached geocoding without consuming public requests', async () => {
    query.mockResolvedValue([{ candidates: [] }]);
    expect(
      await service.search(actor, {
        address: contactAddressSchema.parse({
          street: 'Mitre',
          city: 'Buenos Aires',
        }),
        publicAddress: true,
      }),
    ).toMatchObject({ candidates: [] });
    expect(query).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('fails closed without PAYG disabled and before fetching exhausted image quota', async () => {
    query.mockResolvedValue([place]);
    process.env.ARCGIS_STATIC_MAPS_KEY = 'test';
    await expect(service.image(actor, ref)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    process.env.ARCGIS_PAYG_DISABLED = 'true';
    query.mockReset().mockResolvedValueOnce([place]).mockResolvedValueOnce([]);
    await expect(service.image(actor, ref)).rejects.toMatchObject({
      status: 503,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(query.mock.calls[1][1][2]).toBeLessThanOrEqual(1000);
  });
  it('returns only in-memory image bytes with the key in a bearer header', async () => {
    query
      .mockResolvedValueOnce([place])
      .mockResolvedValueOnce([{ requests: 1 }]);
    process.env.ARCGIS_STATIC_MAPS_KEY = 'key';
    process.env.ARCGIS_PAYG_DISABLED = 'true';
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    });
    expect(await service.image(actor, ref)).toEqual(Buffer.from([1, 2, 3]));
    expect(
      (fetch as jest.Mock).mock.calls[0][0].searchParams.has('token'),
    ).toBe(false);
    expect((fetch as jest.Mock).mock.calls[0][1].headers.Authorization).toBe(
      'Bearer key',
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('uses the selected OSRM profile, ephemeral caching, and fresh accuracy', async () => {
    query
      .mockResolvedValueOnce([place])
      .mockResolvedValueOnce([{ requests: 1 }])
      .mockResolvedValueOnce([place]);
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [{ duration: 120, distance: 1000 }],
      }),
    });
    const input = {
      destination: ref,
      origin: {
        latitude: -34.61,
        longitude: -58.41,
        accuracy: 20,
        timestamp: Date.now(),
      },
      mode: 'walking' as const,
    };
    expect(await service.eta(actor, input)).toMatchObject({
      durationSeconds: 120,
      traffic: false,
      mode: 'walking',
    });
    await service.eta(actor, input);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch as jest.Mock).mock.calls[0][0]).toContain('/routed-foot/');
    expect(query.mock.calls.flat(2)).not.toContain(input.origin.latitude);
    await expect(
      service.eta(actor, {
        ...input,
        origin: { ...input.origin, accuracy: 500 },
      }),
    ).rejects.toThrow();
  });
  it('resolves only company-scoped records and enforces module permissions', async () => {
    await expect(
      service.resolve(
        { ...actor, role: 'staff', permissions: { properties: false } },
        ref,
      ),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValue([]);
    await expect(service.resolve(actor, ref)).rejects.toThrow();
    expect(query.mock.calls[0][1]).toEqual([actor.companyId, ref.id]);
  });
});
