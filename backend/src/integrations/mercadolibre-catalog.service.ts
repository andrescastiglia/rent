import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MercadoLibreConnectionsService } from './mercadolibre-connections.service';
import {
  ProviderHttpService,
  ProviderRequestError,
} from './provider-http.service';
import { ProviderConfigService } from './provider-config.service';
import {
  MercadoLibreCategoryDto,
  MercadoLibreOptionDto,
} from './dto/mercadolibre-catalog.dto';

const option = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(512),
});
const options = z.array(option).max(10000);
const categorySchema = option.extend({
  path_from_root: options,
  children_categories: options,
  settings: z.object({
    listing_allowed: z.boolean(),
    currencies: z.array(z.string()).optional(),
  }),
});
const attributeSchema = z
  .array(
    option.extend({
      value_type: z.string(),
      tags: z.record(z.string(), z.boolean()).default({}),
      value_max_length: z.number().int().positive().optional(),
      values: options.optional(),
      allowed_units: options.optional(),
      default_unit: z.string().optional(),
    }),
  )
  .max(1000);
const listingTypesSchema = z.object({
  category_id: z.string().optional(),
  available: z.array(
    option.extend({
      site_id: z.string(),
      remaining_listings: z.number().int().nonnegative().nullable(),
    }),
  ),
});
const countrySchema = option.extend({ states: options });
const stateSchema = option.extend({ country: option, cities: options });
const citySchema = option.extend({
  country: option,
  neighborhoods: options.optional(),
});
type Account = { accessToken: string; sellerId: number };

@Injectable()
export class MercadoLibreCatalogService {
  constructor(
    private readonly accounts: MercadoLibreConnectionsService,
    private readonly http: ProviderHttpService,
    private readonly config: ProviderConfigService,
  ) {}

  async category(
    companyId: string,
    categoryId = 'MLA1459',
  ): Promise<MercadoLibreCategoryDto> {
    const account = await this.account(companyId);
    const category = await this.categoryData(companyId, account, categoryId);
    const listingAllowed =
      category.settings.listing_allowed &&
      category.children_categories.length === 0;
    const result: MercadoLibreCategoryDto = {
      id: category.id,
      name: category.name,
      path: category.path_from_root,
      children: category.children_categories,
      listingAllowed,
      currencies: (category.settings.currencies ?? []).filter((code) =>
        ['ARS', 'USD'].includes(code),
      ),
      attributes: [],
      listingTypes: [],
    };
    if (!listingAllowed) return result;
    const [attributes, types] = await Promise.all([
      this.read(
        companyId,
        account,
        `/categories/${encodeURIComponent(categoryId)}/attributes`,
        attributeSchema,
      ),
      this.read(
        companyId,
        account,
        `/users/${account.sellerId}/available_listing_types?category_id=${encodeURIComponent(categoryId)}`,
        listingTypesSchema,
      ),
    ]);
    if (types.category_id && types.category_id !== categoryId)
      throw new ProviderRequestError('MERCADOLIBRE', false);
    result.attributes = attributes.map((attribute) => ({
      id: attribute.id,
      name: attribute.name,
      valueType: attribute.value_type,
      required: attribute.tags.required === true,
      readOnly: attribute.tags.read_only === true,
      maxLength: Math.min(attribute.value_max_length ?? 255, 5000),
      values: attribute.values ?? [],
      units: attribute.allowed_units ?? [],
      defaultUnit: attribute.default_unit ?? null,
    }));
    result.listingTypes = types.available
      .filter((type) => type.site_id === 'MLA' && type.remaining_listings !== 0)
      .map((type) => ({
        id: type.id,
        name: type.name,
        remainingListings: type.remaining_listings,
      }));
    return result;
  }

  async assertPublishableCategory(
    companyId: string,
    categoryId: string,
  ): Promise<void> {
    const account = await this.account(companyId);
    const category = await this.categoryData(companyId, account, categoryId);
    if (
      !category.settings.listing_allowed ||
      category.children_categories.length
    )
      throw new BadRequestException(
        'Select a final publishable real estate category',
      );
  }

  async states(companyId: string): Promise<MercadoLibreOptionDto[]> {
    const account = await this.account(companyId);
    const country = await this.read(
      companyId,
      account,
      '/classified_locations/countries/AR',
      countrySchema,
    );
    if (country.id !== 'AR')
      throw new ProviderRequestError('MERCADOLIBRE', false);
    return country.states;
  }
  async cities(
    companyId: string,
    stateId: string,
  ): Promise<MercadoLibreOptionDto[]> {
    const account = await this.account(companyId);
    this.locationId(stateId);
    const state = await this.read(
      companyId,
      account,
      `/classified_locations/states/${encodeURIComponent(stateId)}`,
      stateSchema,
    );
    if (state.id !== stateId || state.country.id !== 'AR')
      throw new BadRequestException('Select an Argentine province');
    return state.cities;
  }
  async neighborhoods(
    companyId: string,
    cityId: string,
  ): Promise<MercadoLibreOptionDto[]> {
    const account = await this.account(companyId);
    this.locationId(cityId);
    const city = await this.read(
      companyId,
      account,
      `/classified_locations/cities/${encodeURIComponent(cityId)}`,
      citySchema,
    );
    if (city.id !== cityId || city.country.id !== 'AR')
      throw new BadRequestException('Select an Argentine city');
    return city.neighborhoods ?? [];
  }

  private async categoryData(companyId: string, account: Account, id: string) {
    if (!/^MLA\d{1,20}$/.test(id))
      throw new BadRequestException('Invalid category');
    const category = await this.read(
      companyId,
      account,
      `/categories/${encodeURIComponent(id)}`,
      categorySchema,
    );
    if (
      category.id !== id ||
      category.path_from_root[0]?.id !== 'MLA1459' ||
      category.path_from_root[category.path_from_root.length - 1]?.id !== id
    )
      throw new BadRequestException(
        'Only Argentine real estate categories are supported',
      );
    return category;
  }
  private locationId(id: string) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
      throw new BadRequestException('Invalid location');
  }
  private async account(companyId: string) {
    this.config.assertEnabled('MERCADOLIBRE');
    if (!companyId) throw new BadRequestException('Company scope required');
    return this.accounts.access(companyId);
  }
  private async read<T>(
    companyId: string,
    account: Account,
    path: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    try {
      const raw = await this.http.request(
        'MERCADOLIBRE',
        // Keep the authority and its trailing slash constant. Only the path
        // can vary, even if a future caller passes an unexpected value.
        `https://api.mercadolibre.com/${path.replace(/^\/+/, '')}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${account.accessToken}` },
        },
      );
      const result = schema.safeParse(raw);
      if (!result.success)
        throw new ProviderRequestError('MERCADOLIBRE', false);
      return result.data;
    } catch (error) {
      if (error instanceof ProviderRequestError && error.status === 401)
        await this.accounts.invalidate(companyId, account.accessToken);
      throw error;
    }
  }
}
