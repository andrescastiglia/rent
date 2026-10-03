import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { MetricsService } from '../metrics/metrics.service';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  AddressSearchDto,
  EtaDto,
  LocationRef,
  NearbyDto,
  locationRefSchema,
} from './contact-data.dto';
import {
  ContactData,
  NormalizedAddress,
  addressFingerprint,
  signAddress,
} from './normalization';
import { whatsappFromRecord } from './phone';
export type GeoActor = {
  id: string;
  companyId: string;
  role: string;
  roles?: string[];
  permissions?: Record<string, boolean>;
};
export type GeoLocation = LocationRef & {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  precise: boolean;
  contactData: ContactData;
  profileId?: string;
  phone?: string | null;
};
const tables = {
  property: 'properties',
  owner: 'owners',
  tenant: 'tenants',
  interested: 'interested_profiles',
} as const;
const modules = {
  property: 'properties',
  owner: 'owners',
  tenant: 'tenants',
  interested: 'interested',
  user: 'users',
};
const activityTables = {
  owner: 'owner_activities',
  tenant: 'tenant_activities',
  interested: 'interested_activities',
};
function addressWithUnits(
  label: string,
  units?: { floor?: string; apartment?: string } | null,
) {
  return [
    label,
    units?.floor ? `Piso ${units.floor}` : '',
    units?.apartment ? `Depto. ${units.apartment}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
@Injectable()
export class ContactDataService {
  private readonly etaCache = new Map<
    string,
    { expires: number; durationSeconds: number; distanceMeters: number }
  >();
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Optional() private readonly metrics?: MetricsService,
  ) {}
  config() {
    return {
      normalization: process.env.CONTACT_NORMALIZATION_ENABLED === 'true',
      maps: process.env.GEO_MAPS_ENABLED === 'true',
      proximity: process.env.GEO_PROXIMITY_ENABLED === 'true',
      radius: 2000,
      imminentRadius: 100,
      exitRadius: 150,
      limit: 5,
    };
  }
  async configuration(actor: GeoActor) {
    const [company] = actor.companyId
      ? await this.db.query('SELECT settings FROM companies WHERE id=$1', [
          actor.companyId,
        ])
      : [];
    const settings = company?.settings?.geo ?? {};
    const imminentRadius = Math.max(
      25,
      Math.min(500, Number(settings.imminentRadius) || 100),
    );
    return {
      ...this.config(),
      radius: Math.max(100, Math.min(10000, Number(settings.radius) || 2000)),
      imminentRadius,
      exitRadius: Math.max(
        imminentRadius + 50,
        Math.min(1000, Number(settings.exitRadius) || 150),
      ),
      scope: { userId: actor.id, companyId: actor.companyId },
    };
  }
  assertActor(actor: GeoActor, type?: keyof typeof modules) {
    const roles = actor.roles?.length ? actor.roles : [actor.role];
    if (!actor.companyId || !roles.some((r) => r === 'admin' || r === 'staff'))
      throw new ForbiddenException('Función reservada al personal');
    if (type && !this.allowed(actor, type))
      throw new ForbiddenException('Sin permiso para este contacto');
  }
  private allowed(actor: GeoActor, type: keyof typeof modules) {
    return (
      (actor.roles?.length ? actor.roles : [actor.role]).includes('admin') ||
      actor.permissions?.[modules[type]] === true
    );
  }
  private enabled(key: 'normalization' | 'maps' | 'proximity') {
    if (!this.config()[key])
      throw new ServiceUnavailableException('Función todavía no habilitada');
  }
  private async reserve(provider: string, period = 'global', cap?: number) {
    const rows = await this.db.query(
      `INSERT INTO geo_provider_usage(provider,period,requests,last_request_at) VALUES($1,$2,1,clock_timestamp()) ON CONFLICT(provider,period) DO UPDATE SET requests=geo_provider_usage.requests+1,last_request_at=clock_timestamp() WHERE ${cap ? 'geo_provider_usage.requests < $3' : "geo_provider_usage.last_request_at <= clock_timestamp()-interval '1 second'"} RETURNING requests`,
      cap ? [provider, period, cap] : [provider, period],
    );
    if (!rows.length) {
      this.metrics?.recordGeo(
        provider,
        cap ? 'quota_exhausted' : 'rate_limited',
      );
      throw new HttpException(
        cap ? 'Cuota gratuita agotada' : 'Esperá un segundo y volvé a intentar',
        cap ? 503 : 429,
      );
    }
    this.metrics?.recordGeo(provider, 'reserved');
  }
  private async providerJson(url: string, init?: RequestInit) {
    try {
      const response = await context.with(
        suppressTracing(context.active()),
        () => {
          const target = new URL(url);
          if (
            target.protocol !== 'https:' ||
            target.port ||
            target.username ||
            target.password ||
            (target.hostname !== 'nominatim.openstreetmap.org' &&
              target.hostname !== 'routing.openstreetmap.de')
          )
            throw new Error('Proveedor geográfico no permitido');
          return fetch(target, {
            ...init,
            redirect: 'error',
            signal: AbortSignal.timeout(8000),
            headers: {
              'User-Agent':
                process.env.GEO_USER_AGENT ||
                'RentFlow/1.0 (address and visit assistance)',
              ...init?.headers,
            },
          });
        },
      );
      if (!response.ok) throw new Error();
      return await response.json();
    } catch {
      this.metrics?.recordGeo(
        url.includes('nominatim') ? 'nominatim' : 'osrm',
        'error',
      );
      throw new ServiceUnavailableException(
        'Servicio geográfico temporalmente no disponible',
      );
    }
  }
  async search(actor: GeoActor, input: AddressSearchDto) {
    this.assertActor(actor);
    this.enabled('normalization');
    const address = input.address;
    if (
      address.confidential ||
      !input.publicAddress ||
      !address.street.trim() ||
      !address.city.trim()
    )
      throw new BadRequestException(
        'Ingresá solamente una dirección pública, sin datos personales',
      );
    const hash = addressFingerprint(address);
    const [cached] = await this.db.query(
      'SELECT candidates FROM geo_geocoding_cache WHERE company_id=$1 AND query_hash=$2 AND expires_at>now()',
      [actor.companyId, hash],
    );
    let candidates: NormalizedAddress[] = cached?.candidates;
    if (candidates) this.metrics?.recordGeo('nominatim', 'cache_hit');
    if (!candidates) {
      if (!process.env.GEO_USER_AGENT?.trim())
        throw new ServiceUnavailableException(
          'Configurá la identificación de la aplicación geográfica',
        );
      await this.reserve('nominatim');
      const url = new URL('/search', 'https://nominatim.openstreetmap.org');
      url.search = new URLSearchParams({
        format: 'jsonv2',
        addressdetails: '1',
        limit: '5',
        street: [address.number, address.street].filter(Boolean).join(' '),
        city: address.city,
        state: address.state,
        country: address.country,
        postalcode: address.postalCode,
      }).toString();
      const result = await this.providerJson(url.toString());
      candidates = (Array.isArray(result) ? result : [])
        .filter(
          (r: Record<string, unknown>) =>
            Number.isFinite(Number(r.lat)) &&
            Number.isFinite(Number(r.lon)) &&
            Math.abs(Number(r.lat)) <= 90 &&
            Math.abs(Number(r.lon)) <= 180,
        )
        .map((r: Record<string, unknown>) => ({
          original: { ...address, floor: undefined, apartment: undefined },
          label: String(r.display_name),
          components: r.address as Record<string, string>,
          latitude: Number(r.lat),
          longitude: Number(r.lon),
          provider: 'nominatim' as const,
          sourceId: `${r.osm_type}:${r.osm_id}`,
          normalizedAt: new Date().toISOString(),
          inputHash: hash,
          precise: Boolean((r.address as Record<string, string>)?.house_number),
        }));
      await this.db.query(
        `INSERT INTO geo_geocoding_cache(company_id,query_hash,candidates) VALUES($1,$2,$3::jsonb) ON CONFLICT(company_id,query_hash) DO UPDATE SET candidates=excluded.candidates,expires_at=now()+interval '30 days'`,
        [actor.companyId, hash, JSON.stringify(candidates)],
      );
    }
    return {
      candidates: candidates.map((address) => ({
        label: address.label,
        precise: address.precise,
        token: signAddress(address, actor.companyId),
      })),
      attribution: '© OpenStreetMap contributors',
      attributionUrl: 'https://www.openstreetmap.org/copyright',
    };
  }
  async places(actor: GeoActor, query: string) {
    this.assertActor(actor);
    const terms = query.trim().slice(0, 100);
    const unions = (Object.keys(tables) as Array<keyof typeof tables>)
      .filter((type) => this.allowed(actor, type))
      .map((type) => {
        const person = type === 'owner' || type === 'tenant';
        return `SELECT '${type}'::text AS type,${type === 'tenant' ? 'p.user_id' : 'p.id'} AS id,${type === 'property' ? 'p.name' : person ? "concat_ws(' ',u.first_name,u.last_name)" : "concat_ws(' ',p.first_name,p.last_name)"} AS name,COALESCE(p.contact_data->'address'->>'label',${type === 'property' ? "concat_ws(' ',p.address_street,p.address_number,p.address_city)" : "concat_ws(' ',p.contact_address->>'street',p.contact_address->>'number',p.contact_address->>'city')"}) AS address FROM ${tables[type]} p ${person ? 'JOIN users u ON u.id=p.user_id AND u.company_id=p.company_id AND u.deleted_at IS NULL' : ''} WHERE p.company_id=$1 AND p.deleted_at IS NULL`;
      });
    if (!unions.length) return [];
    return this.db.query(
      `SELECT * FROM (${unions.join(' UNION ALL ')}) places WHERE name ILIKE $2 OR address ILIKE $2 ORDER BY name,type,id LIMIT 20`,
      [actor.companyId, `%${terms}%`],
    );
  }
  async resolve(actor: GeoActor, input: LocationRef): Promise<GeoLocation> {
    const parsed = locationRefSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Destino inválido');
    const ref = parsed.data;
    const roles = actor.roles?.length ? actor.roles : [actor.role];
    const internal = roles.some((r) => r === 'admin' || r === 'staff');
    let relationship = '';
    if (internal) this.assertActor(actor, ref.type);
    else {
      if (!actor.companyId) throw new ForbiddenException('Sin empresa');
      if (ref.type === 'property') {
        const scopes = [];
        if (roles.includes('owner'))
          scopes.push(
            'EXISTS(SELECT 1 FROM owners o WHERE o.id=p.owner_id AND o.company_id=p.company_id AND o.user_id=$3 AND o.deleted_at IS NULL)',
          );
        if (roles.includes('tenant'))
          scopes.push(
            "EXISTS(SELECT 1 FROM leases l JOIN tenants t ON t.id=l.tenant_id AND t.company_id=l.company_id WHERE l.property_id=p.id AND l.company_id=p.company_id AND l.deleted_at IS NULL AND l.status::text='active' AND t.user_id=$3 AND t.deleted_at IS NULL)",
          );
        if (!scopes.length) throw new ForbiddenException('Lugar no accesible');
        relationship = scopes.join(' OR ');
      } else if (
        (ref.type === 'owner' && roles.includes('owner')) ||
        (ref.type === 'tenant' && roles.includes('tenant'))
      )
        relationship = 'p.user_id=$3';
      else throw new ForbiddenException('Lugar no accesible');
    }
    const table = tables[ref.type];
    const person = ref.type === 'owner' || ref.type === 'tenant';
    const [row] = await this.db.query(
      `SELECT p.*,${person ? "concat_ws(' ',u.first_name,u.last_name) AS person_name,u.phone" : 'NULL::text AS person_name,NULL::text AS phone_unused'} FROM ${table} p ${person ? 'JOIN users u ON u.id=p.user_id AND u.company_id=p.company_id AND u.deleted_at IS NULL' : ''} WHERE p.company_id=$1 AND p.deleted_at IS NULL AND ${ref.type === 'tenant' ? '(p.id=$2::uuid OR p.user_id=$2::uuid)' : 'p.id=$2::uuid'} ${relationship ? `AND (${relationship})` : ''}`,
      relationship
        ? [actor.companyId, ref.id, actor.id]
        : [actor.companyId, ref.id],
    );
    if (!row) throw new NotFoundException('Lugar no disponible');
    const address =
      row.contact_data?.address?.label ||
      (ref.type === 'property'
        ? [
            row.address_street,
            row.address_number,
            row.address_city,
            row.address_state,
          ]
            .filter(Boolean)
            .join(' ')
        : row.contact_address
          ? [
              row.contact_address.street,
              row.contact_address.number,
              row.contact_address.city,
            ]
              .filter(Boolean)
              .join(' ')
          : [row.address, row.city].filter(Boolean).join(' '));
    const location: GeoLocation = {
      ...ref,
      name:
        row.person_name ||
        row.name ||
        [row.first_name, row.last_name].filter(Boolean).join(' '),
      address: addressWithUnits(
        address,
        ref.type === 'property'
          ? { floor: row.address_floor, apartment: row.address_apartment }
          : row.contact_address,
      ),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      precise: row.contact_data?.address?.precise ?? true,
      contactData: row.contact_data ?? {},
      profileId: row.id,
      phone: row.phone,
    };
    if (
      row.latitude === null ||
      row.latitude === undefined ||
      row.longitude === null ||
      row.longitude === undefined ||
      !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      Math.abs(location.latitude) > 90 ||
      Math.abs(location.longitude) > 180
    )
      throw new NotFoundException('Dirección sin coordenadas');
    return location;
  }
  async destination(actor: GeoActor, ref: LocationRef) {
    const p = await this.resolve(actor, ref);
    return {
      type: p.type,
      id: p.id,
      name: p.name,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
      precise: p.precise,
    };
  }
  async entryDestination(actor: GeoActor, id: string) {
    this.assertActor(actor);
    if (!/^(visit|task):[0-9a-f-]{36}$/i.test(id)) return null;
    const [entry] = id.startsWith('visit:')
      ? await this.db.query(
          'SELECT p.id FROM property_visits v JOIN properties p ON p.id=v.property_id WHERE v.id=$1::uuid AND p.company_id=$2 AND p.deleted_at IS NULL',
          [id.slice(6), actor.companyId],
        )
      : await this.db.query(
          `SELECT location_type,location_id,person_type,person_id FROM agenda_tasks WHERE id=$1::uuid AND company_id=$2 AND kind='visit' AND status<>'cancelled'`,
          [id.slice(5), actor.companyId],
        );
    if (!entry) return null;
    const ref = id.startsWith('visit:')
      ? { type: 'property', id: entry.id }
      : entry.location_id
        ? { type: entry.location_type, id: entry.location_id }
        : { type: entry.person_type, id: entry.person_id };
    if (!locationRefSchema.safeParse(ref).success) return null;
    try {
      return await this.destination(actor, ref);
    } catch (e) {
      if (e instanceof NotFoundException || e instanceof ForbiddenException)
        return null;
      throw e;
    }
  }
  async image(actor: GeoActor, ref: LocationRef) {
    this.enabled('maps');
    const point = await this.resolve(actor, ref);
    const key = process.env.ARCGIS_STATIC_MAPS_KEY;
    if (!key || process.env.ARCGIS_PAYG_DISABLED !== 'true')
      throw new ServiceUnavailableException(
        'Imagen temporalmente no disponible',
      );
    const day = Math.max(
      1,
      Math.min(28, Number(process.env.ARCGIS_BILLING_CYCLE_DAY) || 1),
    );
    const now = new Date(),
      start = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() - (now.getUTCDate() < day ? 1 : 0),
          day,
        ),
      );
    const cap = Math.min(
      1000,
      Math.max(1, Number(process.env.ARCGIS_FREE_IMAGE_LIMIT) || 900),
    );
    await this.reserve('arcgis-static', start.toISOString().slice(0, 10), cap);
    const url = new URL(
      'https://static-maps-api.arcgis.com/arcgis/rest/services/static-maps-service/v1/static-maps/arcgis/imagery/with-point',
    );
    url.search = new URLSearchParams({
      x: String(point.longitude),
      y: String(point.latitude),
      zoom: '17',
      width: '600',
      height: '300',
      format: 'jpeg',
      symbolStyle: 'pin',
      attribution: 'dark',
    }).toString();
    try {
      const response = await context.with(
        suppressTracing(context.active()),
        () =>
          fetch(url, {
            headers: { Authorization: `Bearer ${key}` },
            redirect: 'error',
            signal: AbortSignal.timeout(8000),
          }),
      );
      if (
        !response.ok ||
        !response.headers.get('content-type')?.startsWith('image/')
      )
        throw new Error();
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 2_000_000) throw new Error();
      return bytes;
    } catch {
      this.metrics?.recordGeo('arcgis-static', 'error');
      throw new ServiceUnavailableException(
        'Imagen temporalmente no disponible',
      );
    }
  }
  private fresh(origin: EtaDto['origin']) {
    if (
      Date.now() - origin.timestamp > 120000 ||
      origin.timestamp > Date.now() + 30000 ||
      origin.accuracy > 200
    )
      throw new BadRequestException(
        'Actualizá la ubicación para obtener una estimación',
      );
  }
  async eta(actor: GeoActor, input: EtaDto) {
    this.enabled('maps');
    this.fresh(input.origin);
    const dest = await this.resolve(actor, input.destination);
    const mode = input.mode ?? 'driving';
    // Only ephemeral memory contains origins; no coordinates or routes are stored in PostgreSQL.
    const key = `${actor.companyId}:${mode}:${input.origin.longitude.toFixed(4)},${input.origin.latitude.toFixed(4)}:${dest.longitude},${dest.latitude}`;
    let route = this.etaCache.get(key);
    if (!route || route.expires < Date.now()) {
      await this.reserve('osrm');
      const endpoint = {
        driving: 'routed-car',
        walking: 'routed-foot',
        cycling: 'routed-bike',
      }[mode];
      const coordinates = [
        input.origin.longitude,
        input.origin.latitude,
        dest.longitude,
        dest.latitude,
      ].map((value) => encodeURIComponent(String(value)));
      const result = await this.providerJson(
        `https://routing.openstreetmap.de/${endpoint}/route/v1/driving/${coordinates[0]},${coordinates[1]};${coordinates[2]},${coordinates[3]}?overview=false&steps=false`,
      );
      if (
        result.code !== 'Ok' ||
        !result.routes?.length ||
        !Number.isFinite(result.routes[0].duration) ||
        result.routes[0].duration < 0 ||
        !Number.isFinite(result.routes[0].distance)
      )
        throw new ServiceUnavailableException('No hay una ruta disponible');
      route = {
        expires: Date.now() + 60000,
        durationSeconds: result.routes[0].duration,
        distanceMeters: result.routes[0].distance,
      };
      if (this.etaCache.size >= 200) this.etaCache.clear();
      this.etaCache.set(key, route);
    } else this.metrics?.recordGeo('osrm', 'cache_hit');
    return {
      durationSeconds: route.durationSeconds,
      distanceMeters: route.distanceMeters,
      arrivesAt: new Date(
        Date.now() + route.durationSeconds * 1000,
      ).toISOString(),
      mode,
      traffic: false,
      attribution: 'OSRM · © OpenStreetMap contributors',
    };
  }
  async nearby(actor: GeoActor, input: NearbyDto) {
    this.assertActor(actor);
    this.enabled('proximity');
    this.fresh(input.origin);
    const [company] = await this.db.query(
      'SELECT settings FROM companies WHERE id=$1',
      [actor.companyId],
    );
    const defaults = company?.settings?.geo ?? {};
    const radius =
      input.radius ??
      Math.min(10000, Math.max(100, Number(defaults.radius) || 2000));
    const limit = input.limit ?? 5;
    const unions = (Object.keys(tables) as Array<keyof typeof tables>)
      .filter((type) => this.allowed(actor, type))
      .map((type) => {
        const person = type === 'owner' || type === 'tenant';
        return `SELECT '${type}'::text AS type,${type === 'tenant' ? 'p.user_id' : 'p.id'} AS id,p.latitude,p.longitude,p.contact_data AS "contactData",${type === 'property' ? "jsonb_build_object('floor',p.address_floor,'apartment',p.address_apartment)" : 'p.contact_address'} AS units,${type === 'property' ? 'p.name' : person ? "concat_ws(' ',u.first_name,u.last_name)" : "concat_ws(' ',p.first_name,p.last_name)"} AS name,COALESCE(p.contact_data->'address'->>'label',${type === 'property' ? "concat_ws(' ',p.address_street,p.address_number,p.address_city)" : "concat_ws(' ',p.contact_address->>'street',p.contact_address->>'number',p.contact_address->>'city')"}) AS address,ST_Distance(p.location,ST_SetSRID(ST_MakePoint($3,$2),4326)::geography) AS distance FROM ${tables[type]} p ${person ? 'JOIN users u ON u.id=p.user_id AND u.company_id=p.company_id AND u.deleted_at IS NULL' : ''} WHERE p.company_id=$1 AND p.deleted_at IS NULL AND p.location IS NOT NULL AND ST_DWithin(p.location,ST_SetSRID(ST_MakePoint($3,$2),4326)::geography,$4)`;
      });
    if (!unions.length)
      return { places: [], imminentRadius: 100, exitRadius: 150 };
    const places = await this.db.query(
      `SELECT * FROM (${unions.join(' UNION ALL ')}) places ORDER BY distance,type,id LIMIT $5`,
      [
        actor.companyId,
        input.origin.latitude,
        input.origin.longitude,
        radius,
        limit,
      ],
    );
    for (const p of places) {
      p.precise = p.contactData?.address?.precise ?? true;
      delete p.contactData;
      p.address = addressWithUnits(p.address, p.units);
      delete p.units;
      p.contacts = await this.contacts(actor, { type: p.type, id: p.id });
    }
    const imminentRadius = Math.max(
      25,
      Math.min(500, Number(defaults.imminentRadius) || 100),
    );
    return {
      places,
      imminentRadius,
      exitRadius: Math.max(
        imminentRadius + 50,
        Math.min(1000, Number(defaults.exitRadius) || 150),
      ),
    };
  }
  async contacts(actor: GeoActor, ref: LocationRef) {
    const place = await this.resolve(actor, ref);
    if (ref.type !== 'property')
      return [
        {
          type: ref.type,
          id: ref.id,
          name: place.name,
          relationship: 'Domicilio registrado',
        },
      ];
    const rows = await this.db.query(
      `SELECT 'owner' AS type,o.id,concat_ws(' ',u.first_name,u.last_name) AS name,'Propietario' AS relationship FROM properties p JOIN owners o ON o.id=p.owner_id AND o.company_id=p.company_id AND o.deleted_at IS NULL JOIN users u ON u.id=o.user_id AND u.company_id=o.company_id AND u.deleted_at IS NULL WHERE p.id=$1 AND p.company_id=$2
    UNION SELECT 'tenant',u.id,concat_ws(' ',u.first_name,u.last_name),'Contrato activo' FROM leases l JOIN tenants t ON t.id=l.tenant_id AND t.company_id=l.company_id AND t.deleted_at IS NULL JOIN users u ON u.id=t.user_id AND u.company_id=t.company_id AND u.deleted_at IS NULL WHERE l.property_id=$1 AND l.company_id=$2 AND l.status::text='active' AND l.deleted_at IS NULL
    UNION SELECT 'interested',i.id,concat_ws(' ',i.first_name,i.last_name),'Visita del día' FROM property_visits v JOIN properties p ON p.id=v.property_id JOIN companies c ON c.id=p.company_id JOIN interested_profiles i ON i.id::text=v.interested_profile_id::text AND i.company_id=p.company_id AND i.deleted_at IS NULL WHERE p.id=$1 AND p.company_id=$2 AND v.completed_at IS NULL AND (v.visited_at AT TIME ZONE COALESCE(c.settings->>'timezone','America/Argentina/Buenos_Aires'))::date=(now() AT TIME ZONE COALESCE(c.settings->>'timezone','America/Argentina/Buenos_Aires'))::date`,
      [ref.id, actor.companyId],
    );
    return rows.filter((r: { type: keyof typeof modules }) =>
      this.allowed(actor, r.type),
    );
  }
  async history(actor: GeoActor, ref: LocationRef) {
    if (ref.type === 'property')
      throw new BadRequestException('Seleccioná una persona');
    this.assertActor(actor, ref.type);
    const table = tables[ref.type];
    const person = ref.type === 'owner' || ref.type === 'tenant';
    const [row] = await this.db.query(
      `SELECT p.id,${person ? 'u.phone,u.contact_data AS account_contact_data' : 'p.phone'},p.contact_data FROM ${table} p ${person ? 'JOIN users u ON u.id=p.user_id AND u.company_id=p.company_id AND u.deleted_at IS NULL' : ''} WHERE p.company_id=$1 AND p.deleted_at IS NULL AND ${ref.type === 'tenant' ? '(p.id=$2::uuid OR p.user_id=$2::uuid)' : 'p.id=$2::uuid'}`,
      [actor.companyId, ref.id],
    );
    if (!row) throw new NotFoundException('Persona no disponible');
    const activities = activityTables[ref.type];
    const field =
      ref.type === 'interested' ? 'interested_profile_id' : `${ref.type}_id`;
    const communications = await this.db.query(
      `SELECT id,channel,direction,left(body,300) AS summary,created_at AS "createdAt" FROM person_communications WHERE company_id=$1 AND person_type=$2 AND person_id=$3
     UNION ALL SELECT a.id,a.type::text,'outbound',left(concat_ws(' · ',a.subject,a.body),300),a.created_at FROM ${activities} a ${ref.type === 'interested' ? 'JOIN interested_profiles p ON p.id::text=a.interested_profile_id::text' : ''} WHERE ${ref.type === 'interested' ? 'p.company_id' : 'a.company_id'}=$1 AND a.${field}::text=$3::text AND ${ref.type === 'interested' ? 'p.deleted_at' : 'a.deleted_at'} IS NULL AND a.type::text IN ('call','email','whatsapp') AND a.status::text='completed' AND NOT EXISTS(SELECT 1 FROM person_communications pc WHERE pc.company_id=$1 AND pc.person_type=$2 AND pc.person_id=$3 AND ((pc.metadata->>'activityId')=a.id::text OR (pc.whatsapp_message_id IS NOT NULL AND pc.whatsapp_message_id=a.metadata->'whatsapp'->>'messageId'))) ORDER BY "createdAt" DESC,id DESC LIMIT 5`,
      [actor.companyId, ref.type, row.id],
    );
    const phone = whatsappFromRecord(row);
    return { communications, whatsappPhone: phone || null };
  }
  async arrivalOpened(actor: GeoActor, ref: LocationRef) {
    await this.history(actor, ref);
    await this.db.query(
      `INSERT INTO contact_navigation_events(company_id,actor_id,person_type,person_id,event) VALUES($1,$2,$3,$4,'arrival_whatsapp_opened')`,
      [actor.companyId, actor.id, ref.type, ref.id],
    );
    return { event: 'arrival_whatsapp_opened', sent: false };
  }
}
