import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ContactDataService } from '../src/contact-data/contact-data.service';
const url = process.env.CONTACT_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'contact data with real PostgreSQL/PostGIS',
  () => {
    let db: DataSource,
      service: ContactDataService,
      company: string,
      otherCompany: string,
      user: string,
      owner: string,
      tenant: string,
      interested: string,
      property: string;
    const origin = {
      latitude: -34.6,
      longitude: -58.4,
      accuracy: 10,
      timestamp: Date.now(),
    };
    beforeAll(async () => {
      if (!url || !/^rent_.*test/.test(new URL(url).pathname.slice(1)))
        throw new Error('An isolated rent_*test database is required');
      db = new DataSource({
        type: 'postgres',
        url,
        entities: [],
        synchronize: false,
        logging: false,
        extra: { max: 1 },
      });
      await db.initialize();
      await db.query('BEGIN');
      await db.query(
        readFileSync(
          resolve(
            __dirname,
            '../../migrations/145_contact_data_and_geography.sql',
          ),
          'utf8',
        ),
      );
      company = randomUUID();
      otherCompany = randomUUID();
      user = randomUUID();
      owner = randomUUID();
      tenant = randomUUID();
      interested = randomUUID();
      property = randomUUID();
      await db.query(
        "INSERT INTO companies(id,name) VALUES($1,'Contact Test'),($2,'Other Test')",
        [company, otherCompany],
      );
      await db.query(
        "INSERT INTO users(id,company_id,password_hash,role,roles,first_name,last_name,phone) VALUES($1,$2,'test','admin',ARRAY['admin','owner','tenant']::user_role[],'Ana','Test','01143215678')",
        [user, company],
      );
      await db.query(
        'INSERT INTO owners(id,company_id,user_id,latitude,longitude) VALUES($1,$2,$3,-34.6,-58.4)',
        [owner, company, user],
      );
      await db.query(
        "INSERT INTO tenants(id,company_id,user_id,dni,latitude,longitude) VALUES($1,$2,$3,'CONTACT-TEST',-34.6,-58.4)",
        [tenant, company, user],
      );
      await db.query(
        "INSERT INTO interested_profiles(id,company_id,first_name,last_name,phone,latitude,longitude) VALUES($1,$2,'Pedro','Test','01143215678',-34.6,-58.4)",
        [interested, company],
      );
      await db.query(
        "INSERT INTO properties(id,company_id,owner_id,name,property_type,address_street,address_number,address_city,address_state,latitude,longitude) VALUES($1,$2,$3,'Test Property','apartment','Mitre','100','Buenos Aires','CABA',-34.6,-58.4)",
        [property, company, owner],
      );
      service = new ContactDataService(db);
      process.env.GEO_PROXIMITY_ENABLED = 'true';
    });
    afterAll(async () => {
      delete process.env.GEO_PROXIMITY_ENABLED;
      if (db?.isInitialized) {
        await db.query('ROLLBACK');
        await db.destroy();
      }
    });
    const actor = () => ({ id: user, companyId: company, role: 'admin' });
    it('creates SRID 4326 geography and partial GiST indexes from valid legacy coordinates', async () => {
      const [row] = await db.query(
        'SELECT ST_SRID(location::geometry) AS srid,ST_X(location::geometry) AS lon,ST_Y(location::geometry) AS lat FROM properties WHERE id=$1',
        [property],
      );
      expect(row).toEqual({ srid: 4326, lon: -58.4, lat: -34.6 });
      const rows = await db.query(
        "SELECT indexdef FROM pg_indexes WHERE indexname IN ('idx_properties_geography','idx_owners_geography','idx_tenants_geography','idx_interested_profiles_geography')",
      );
      expect(rows).toHaveLength(4);
      expect(
        rows.every((r: { indexdef: string }) =>
          r.indexdef.includes('USING gist'),
        ),
      ).toBe(true);
    });
    it('retains a point for a unit edit, invalidates after a street edit, and ignores invalid pairs', async () => {
      await db.query(
        "UPDATE properties SET address_apartment='B' WHERE id=$1",
        [property],
      );
      expect(
        (
          await db.query(
            'SELECT location IS NOT NULL AS present FROM properties WHERE id=$1',
            [property],
          )
        )[0].present,
      ).toBe(true);
      await db.query("UPDATE properties SET address_number='101' WHERE id=$1", [
        property,
      ]);
      expect(
        (
          await db.query(
            'SELECT latitude,longitude,location FROM properties WHERE id=$1',
            [property],
          )
        )[0],
      ).toMatchObject({ latitude: null, longitude: null, location: null });
      await db.query(
        'UPDATE properties SET latitude=91,longitude=-58.4 WHERE id=$1',
        [property],
      );
      expect(
        (
          await db.query('SELECT location FROM properties WHERE id=$1', [
            property,
          ])
        )[0].location,
      ).toBeNull();
      await db.query(
        'UPDATE properties SET latitude=-34.6,longitude=-58.4 WHERE id=$1',
        [property],
      );
    });
    it('isolates nearby places and destinations by company and module permissions', async () => {
      const result = await service.nearby(actor(), {
        origin: { ...origin, timestamp: Date.now() },
      });
      expect(result.places).toHaveLength(4);
      expect(
        result.places.every((p: { distance: number }) => p.distance < 1),
      ).toBe(true);
      expect(
        result.places.find(
          (p: { type: string; id: string }) => p.type === 'tenant',
        ).id,
      ).toBe(user);
      expect(
        (
          await service.nearby(
            { ...actor(), companyId: otherCompany },
            { origin: { ...origin, timestamp: Date.now() } },
          )
        ).places,
      ).toEqual([]);
      expect(
        (
          await service.nearby(
            { ...actor(), role: 'staff', permissions: { properties: true } },
            { origin: { ...origin, timestamp: Date.now() } },
          )
        ).places.map((p: { type: string }) => p.type),
      ).toEqual(['property']);
      await expect(
        service.destination(
          { ...actor(), companyId: otherCompany },
          { type: 'property', id: property },
        ),
      ).rejects.toThrow();
    });
    it('allows external owners and tenants only their own registered destinations', async () => {
      const external = { id: user, companyId: company, role: 'owner' };
      expect(
        await service.destination(external, { type: 'property', id: property }),
      ).toMatchObject({
        id: property,
        address: expect.stringContaining('Depto. B'),
      });
      expect(
        await service.destination(external, { type: 'owner', id: owner }),
      ).toMatchObject({ id: owner });
      await expect(
        service.destination(
          { ...external, id: randomUUID() },
          { type: 'property', id: property },
        ),
      ).rejects.toThrow();
      await expect(
        service.destination(external, { type: 'interested', id: interested }),
      ).rejects.toThrow();
      expect(
        await service.destination(
          { ...external, role: 'tenant' },
          { type: 'tenant', id: user },
        ),
      ).toMatchObject({ id: user });
      await expect(
        service.nearby(external, {
          origin: { ...origin, timestamp: Date.now() },
        }),
      ).rejects.toThrow();
    });
    it('unifies CRM and communications without duplicating linked deliveries; logs only composer openings', async () => {
      const activity = randomUUID();
      await db.query(
        "INSERT INTO interested_activities(id,interested_profile_id,type,status,subject,body) VALUES($1,$2,'whatsapp','completed','Visita','Confirmada')",
        [activity, interested],
      );
      await db.query(
        "INSERT INTO person_communications(company_id,person_type,person_id,direction,body,metadata) VALUES($1,'interested',$2,'outbound','Visita confirmada',$3::jsonb)",
        [company, interested, JSON.stringify({ activityId: activity })],
      );
      const history = await service.history(actor(), {
        type: 'interested',
        id: interested,
      });
      expect(history.communications).toHaveLength(1);
      expect(history.whatsappPhone).toBe('541143215678');
      expect(
        await service.arrivalOpened(actor(), {
          type: 'interested',
          id: interested,
        }),
      ).toEqual({ event: 'arrival_whatsapp_opened', sent: false });
    });
    it('invalidates accepted telephone data in every linked profile when the original changes', async () => {
      const data = JSON.stringify({
        phones: { phone: { original: '01143215678', e164: '+541143215678' } },
      });
      await db.query('UPDATE owners SET contact_data=$2::jsonb WHERE id=$1', [
        owner,
        data,
      ]);
      await db.query('UPDATE tenants SET contact_data=$2::jsonb WHERE id=$1', [
        tenant,
        data,
      ]);
      await db.query('UPDATE users SET contact_data=$2::jsonb WHERE id=$1', [
        user,
        data,
      ]);
      await db.query("UPDATE users SET phone='01143215679' WHERE id=$1", [
        user,
      ]);
      for (const [table, id] of [
        ['users', user],
        ['owners', owner],
        ['tenants', tenant],
      ])
        expect(
          (
            await db.query(`SELECT contact_data FROM ${table} WHERE id=$1`, [
              id,
            ])
          )[0].contact_data.phones?.phone,
        ).toBeUndefined();
    });
    it('serializes quota reservations and global rate limits across service instances', async () => {
      const provider = `test-${randomUUID()}`;
      const statement =
        "INSERT INTO geo_provider_usage(provider,period,requests,last_request_at) VALUES($1,'global',1,clock_timestamp()) ON CONFLICT(provider,period) DO UPDATE SET requests=geo_provider_usage.requests+1,last_request_at=clock_timestamp() WHERE geo_provider_usage.last_request_at<=clock_timestamp()-interval '1 second' RETURNING requests";
      expect(await db.query(statement, [provider])).toHaveLength(1);
      expect(await db.query(statement, [provider])).toHaveLength(0);
      expect(
        await db.query(
          "INSERT INTO geo_provider_usage(provider,period,requests) VALUES($1,'cycle',1) ON CONFLICT(provider,period) DO UPDATE SET requests=geo_provider_usage.requests+1 WHERE geo_provider_usage.requests<1 RETURNING requests",
          [provider],
        ),
      ).toHaveLength(1);
      expect(
        await db.query(
          "INSERT INTO geo_provider_usage(provider,period,requests) VALUES($1,'cycle',1) ON CONFLICT(provider,period) DO UPDATE SET requests=geo_provider_usage.requests+1 WHERE geo_provider_usage.requests<1 RETURNING requests",
          [provider],
        ),
      ).toHaveLength(0);
    });
  },
);
