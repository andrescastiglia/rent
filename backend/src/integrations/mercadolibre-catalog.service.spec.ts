import { BadRequestException } from '@nestjs/common';
import { MercadoLibreCatalogService } from './mercadolibre-catalog.service';
import { MercadoLibreCatalogController } from './mercadolibre-catalog.controller';
import { ProviderRequestError } from './provider-http.service';
const root = { id: 'MLA1459', name: 'Inmuebles' };
const leaf = { id: 'MLA401685', name: 'Casas en venta' };
const category = {
  ...leaf,
  path_from_root: [root, leaf],
  children_categories: [],
  settings: { listing_allowed: true, currencies: ['ARS', 'USD', 'BRL'] },
};
function setup() {
  const accounts = {
    access: jest
      .fn()
      .mockResolvedValue({ accessToken: 'test-token', sellerId: 42 }),
    invalidate: jest.fn(),
  };
  const http = { request: jest.fn() };
  const config = { assertEnabled: jest.fn() };
  const service = new MercadoLibreCatalogService(
    accounts as never,
    http as never,
    config as never,
  );
  return { service, accounts, http, config };
}
describe('Mercado Libre catalog', () => {
  it('blocks every catalog route before storage or HTTP while disabled', async () => {
    const f = setup();
    f.config.assertEnabled.mockImplementation(() => {
      throw new Error('disabled');
    });
    for (const operation of [
      () => f.service.category('company'),
      () => f.service.assertPublishableCategory('company', leaf.id),
      () => f.service.states('company'),
      () => f.service.cities('company', 'STATE'),
      () => f.service.neighborhoods('company', 'CITY'),
    ])
      await expect(operation()).rejects.toThrow('disabled');
    expect(f.accounts.access).not.toHaveBeenCalled();
    expect(f.http.request).not.toHaveBeenCalled();
  });
  it('returns only navigation for non-leaf categories', async () => {
    const f = setup();
    f.http.request.mockResolvedValue({
      ...root,
      path_from_root: [root],
      children_categories: [leaf],
      settings: { listing_allowed: false },
    });
    await expect(f.service.category('company')).resolves.toEqual({
      ...root,
      path: [root],
      children: [leaf],
      listingAllowed: false,
      currencies: [],
      attributes: [],
      listingTypes: [],
    });
    expect(f.http.request).toHaveBeenCalledTimes(1);
  });
  it('maps required attributes, units and seller-specific available listing types', async () => {
    const f = setup();
    f.http.request.mockImplementation(async (_provider, url) => {
      if (url.endsWith('/attributes'))
        return [
          {
            id: 'AREA',
            name: 'Superficie',
            value_type: 'number_unit',
            tags: { required: true },
            allowed_units: [{ id: 'm²', name: 'm²' }],
            default_unit: 'm²',
            value_max_length: 10000,
          },
          {
            id: 'FIXED',
            name: 'Tipo',
            value_type: 'list',
            tags: { read_only: true },
            values: [{ id: '1', name: 'Casa' }],
          },
        ];
      if (url.includes('/available_listing_types'))
        return {
          category_id: leaf.id,
          available: [
            {
              id: 'gold',
              name: 'Gold',
              site_id: 'MLA',
              remaining_listings: null,
            },
            { id: 'free', name: 'Free', site_id: 'MLA', remaining_listings: 0 },
            {
              id: 'other',
              name: 'Other',
              site_id: 'MLB',
              remaining_listings: 10,
            },
          ],
        };
      return category;
    });
    await expect(f.service.category('company', leaf.id)).resolves.toMatchObject(
      {
        listingAllowed: true,
        currencies: ['ARS', 'USD'],
        attributes: [
          {
            required: true,
            readOnly: false,
            maxLength: 5000,
            units: [{ id: 'm²', name: 'm²' }],
            defaultUnit: 'm²',
          },
          {
            required: false,
            readOnly: true,
            maxLength: 255,
            units: [],
            defaultUnit: null,
          },
        ],
        listingTypes: [{ id: 'gold', name: 'Gold', remainingListings: null }],
      },
    );
    expect(f.http.request).toHaveBeenCalledWith(
      'MERCADOLIBRE',
      `https://api.mercadolibre.com/users/42/available_listing_types?category_id=${leaf.id}`,
      { method: 'GET', headers: { Authorization: 'Bearer test-token' } },
    );
    expect(
      f.http.request.mock.calls.every((call) => call[2].method === 'GET'),
    ).toBe(true);
  });
  it.each(['wrong_id', 'wrong_root', 'wrong_path', 'parent', 'disabled_leaf'])(
    'rejects unsupported creation category %s',
    async (kind) => {
      const f = setup();
      const raw = { ...category };
      if (kind === 'wrong_id') raw.id = 'MLA999';
      if (kind === 'wrong_root')
        raw.path_from_root = [{ id: 'MLA999', name: 'Other' }, leaf];
      if (kind === 'wrong_path') raw.path_from_root = [root];
      if (kind === 'parent') raw.children_categories = [leaf] as never;
      if (kind === 'disabled_leaf')
        raw.settings = { ...category.settings, listing_allowed: false };
      f.http.request.mockResolvedValue(raw);
      await expect(
        f.service.assertPublishableCategory('company', leaf.id),
      ).rejects.toThrow(BadRequestException);
    },
  );
  it('accepts a final real estate category without reading availability or performing a mutation', async () => {
    const f = setup();
    f.http.request.mockResolvedValue(category);
    await f.service.assertPublishableCategory('company', leaf.id);
    expect(f.http.request).toHaveBeenCalledTimes(1);
  });
  it('rejects missing company scope and path injection before outbound HTTP', async () => {
    const f = setup();
    await expect(f.service.category('', leaf.id)).rejects.toThrow(
      'Company scope',
    );
    await expect(f.service.category('company', '../users')).rejects.toThrow(
      'Invalid category',
    );
    await expect(f.service.cities('company', '../users')).rejects.toThrow(
      'Invalid location',
    );
    expect(f.http.request).not.toHaveBeenCalled();
  });
  it('does not expose malformed provider responses or mismatched category availability', async () => {
    const f = setup();
    f.http.request.mockResolvedValue({ private: 'do-not-expose' });
    await expect(f.service.category('company')).rejects.toThrow(
      'MERCADOLIBRE request failed',
    );
    f.http.request.mockImplementation(async (_provider, url) =>
      url.endsWith('/attributes')
        ? []
        : url.includes('available_listing_types')
          ? { category_id: 'MLA999', available: [] }
          : category,
    );
    await expect(f.service.category('company', leaf.id)).rejects.toThrow(
      ProviderRequestError,
    );
  });
  it('allows absent optional availability category and uses each account token', async () => {
    const f = setup();
    f.http.request.mockImplementation(async (_provider, url) =>
      url.endsWith('/attributes')
        ? []
        : url.includes('available_listing_types')
          ? { available: [] }
          : category,
    );
    await f.service.category('company', leaf.id);
    expect(f.accounts.access).toHaveBeenCalledWith('company');
  });
  it('returns Argentine provinces, cities and neighborhoods', async () => {
    const f = setup();
    const country = { id: 'AR', name: 'Argentina' };
    const state = { id: 'STATE', name: 'Provincia' };
    const city = { id: 'CITY', name: 'Ciudad' };
    const neighborhood = { id: 'NEIGHBORHOOD', name: 'Barrio' };
    f.http.request
      .mockResolvedValueOnce({ ...country, states: [state] })
      .mockResolvedValueOnce({ ...state, country, cities: [city] })
      .mockResolvedValueOnce({
        ...city,
        country,
        neighborhoods: [neighborhood],
      })
      .mockResolvedValueOnce({ ...city, country });
    await expect(f.service.states('company')).resolves.toEqual([state]);
    await expect(f.service.cities('company', 'STATE')).resolves.toEqual([city]);
    await expect(f.service.neighborhoods('company', 'CITY')).resolves.toEqual([
      neighborhood,
    ]);
    await expect(f.service.neighborhoods('company', 'CITY')).resolves.toEqual(
      [],
    );
  });
  it.each(['country', 'state_id', 'state_country', 'city_id', 'city_country'])(
    'rejects mismatched location %s',
    async (kind) => {
      const f = setup();
      if (kind === 'country') {
        f.http.request.mockResolvedValue({
          id: 'UY',
          name: 'Uruguay',
          states: [],
        });
        await expect(f.service.states('company')).rejects.toThrow(
          ProviderRequestError,
        );
        return;
      }
      const isState = kind.startsWith('state');
      f.http.request.mockResolvedValue({
        id: kind.endsWith('_id') ? 'OTHER' : isState ? 'STATE' : 'CITY',
        name: 'Location',
        country: {
          id: kind.endsWith('_country') ? 'UY' : 'AR',
          name: 'Country',
        },
        cities: [],
        neighborhoods: [],
      });
      await expect(
        isState
          ? f.service.cities('company', 'STATE')
          : f.service.neighborhoods('company', 'CITY'),
      ).rejects.toThrow(BadRequestException);
    },
  );
  it.each([401, 403])(
    'invalidates only rejected credentials on HTTP %s, without retries',
    async (status) => {
      const f = setup();
      f.http.request.mockRejectedValue(
        new ProviderRequestError('MERCADOLIBRE', false, status),
      );
      await expect(f.service.states('company')).rejects.toThrow(
        ProviderRequestError,
      );
      expect(f.accounts.invalidate).toHaveBeenCalledTimes(
        status === 401 ? 1 : 0,
      );
      expect(f.http.request).toHaveBeenCalledTimes(1);
    },
  );
  it('passes authenticated scope from all catalog endpoints', async () => {
    const service = {
      category: jest.fn(),
      states: jest.fn(),
      cities: jest.fn(),
      neighborhoods: jest.fn(),
    };
    const c = new MercadoLibreCatalogController(service as never);
    const req = { user: { companyId: 'company' } };
    await c.category('MLA1459', req);
    await c.states(req);
    await c.cities('STATE', req);
    await c.neighborhoods('CITY', req);
    expect(service.category).toHaveBeenCalledWith('company', 'MLA1459');
    expect(service.states).toHaveBeenCalledWith('company');
    expect(service.cities).toHaveBeenCalledWith('company', 'STATE');
    expect(service.neighborhoods).toHaveBeenCalledWith('company', 'CITY');
  });
});
