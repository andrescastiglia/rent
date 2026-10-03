CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_data jsonb NOT NULL DEFAULT '{}';
DO $$ DECLARE tbl text; BEGIN
 FOR tbl IN SELECT unnest(ARRAY['properties','owners','tenants','interested_profiles']) LOOP
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS contact_data jsonb NOT NULL DEFAULT ''{}''',tbl);
  IF tbl <> 'properties' THEN EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS contact_address jsonb, ADD COLUMN IF NOT EXISTS latitude double precision, ADD COLUMN IF NOT EXISTS longitude double precision',tbl); END IF;
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS location geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 THEN ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography END) STORED',tbl);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING gist(location) WHERE deleted_at IS NULL AND location IS NOT NULL','idx_'||tbl||'_geography',tbl);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION contact_data_invalidate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_json jsonb; new_json jsonb; address_changed boolean; key text; field text;
BEGIN
 old_json:=to_jsonb(OLD); new_json:=to_jsonb(NEW);
 IF TG_TABLE_NAME<>'users' THEN
  IF TG_TABLE_NAME='properties' THEN
   address_changed:=(old_json->>'address_street',old_json->>'address_number',old_json->>'address_city',old_json->>'address_state',old_json->>'address_country',old_json->>'address_postal_code') IS DISTINCT FROM (new_json->>'address_street',new_json->>'address_number',new_json->>'address_city',new_json->>'address_state',new_json->>'address_country',new_json->>'address_postal_code');
  ELSE
   address_changed:=(CASE WHEN jsonb_typeof(old_json->'contact_address')='object' THEN (old_json->'contact_address')-'floor'-'apartment' END) IS DISTINCT FROM (CASE WHEN jsonb_typeof(new_json->'contact_address')='object' THEN (new_json->'contact_address')-'floor'-'apartment' END);
   IF TG_TABLE_NAME='owners' THEN address_changed:=address_changed OR (old_json->>'address',old_json->>'city',old_json->>'state',old_json->>'country',old_json->>'postal_code') IS DISTINCT FROM (new_json->>'address',new_json->>'city',new_json->>'state',new_json->>'country',new_json->>'postal_code'); END IF;
  END IF;
  IF address_changed AND (NEW.contact_data->'address') IS NOT DISTINCT FROM (OLD.contact_data->'address') THEN
   NEW.contact_data:=NEW.contact_data-'address'; NEW.latitude:=NULL; NEW.longitude:=NULL;
  END IF;
 END IF;
 FOR key,field IN SELECT * FROM (VALUES ('phone','phone'),('ownerWhatsapp','owner_whatsapp'),('emergencyContactPhone','emergency_contact_phone'),('emergencyPhone','emergency_contact_phone')) AS fields(k,f) LOOP
  IF new_json ? field AND old_json->field IS DISTINCT FROM new_json->field AND NEW.contact_data->'phones'->key IS NOT DISTINCT FROM OLD.contact_data->'phones'->key THEN NEW.contact_data:=NEW.contact_data #- ARRAY['phones',key]; END IF;
 END LOOP;
 RETURN NEW;
END $$;
DO $$ DECLARE tbl text; BEGIN
 FOR tbl IN SELECT unnest(ARRAY['users','properties','owners','tenants','interested_profiles']) LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS contact_data_invalidate ON %I',tbl);
  EXECUTE format('CREATE TRIGGER contact_data_invalidate BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION contact_data_invalidate()',tbl);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION contact_person_phone_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.phone IS DISTINCT FROM OLD.phone THEN
 UPDATE owners SET contact_data=contact_data #- '{phones,phone}' WHERE user_id=NEW.id;
 UPDATE tenants SET contact_data=contact_data #- '{phones,phone}' WHERE user_id=NEW.id;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contact_person_phone_changed ON users;
CREATE TRIGGER contact_person_phone_changed AFTER UPDATE OF phone ON users FOR EACH ROW EXECUTE FUNCTION contact_person_phone_changed();
CREATE TABLE IF NOT EXISTS geo_provider_usage (
 provider text NOT NULL, period text NOT NULL, requests integer NOT NULL DEFAULT 0, last_request_at timestamptz, PRIMARY KEY(provider,period)
);
CREATE TABLE IF NOT EXISTS geo_geocoding_cache (
 company_id uuid NOT NULL REFERENCES companies(id), query_hash text NOT NULL, candidates jsonb NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days', PRIMARY KEY(company_id,query_hash)
);
ALTER TABLE agenda_tasks ADD COLUMN IF NOT EXISTS location_type varchar(20), ADD COLUMN IF NOT EXISTS location_id uuid;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='agenda_location_pair') THEN
 ALTER TABLE agenda_tasks ADD CONSTRAINT agenda_location_pair CHECK ((location_type IS NULL)=(location_id IS NULL));
 ALTER TABLE agenda_tasks ADD CONSTRAINT agenda_location_type CHECK(location_type IN ('property','owner','tenant','interested'));
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS contact_navigation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), actor_id uuid NOT NULL REFERENCES users(id),
 person_type varchar(20) NOT NULL CHECK(person_type IN ('owner','tenant','interested')), person_id uuid NOT NULL,
 event varchar(30) NOT NULL CHECK(event='arrival_whatsapp_opened'), created_at timestamptz NOT NULL DEFAULT now()
);
