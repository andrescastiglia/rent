-- Preserve schedule precision in source modules; legacy midnight UTC values were civil dates.
ALTER TABLE property_visits ADD COLUMN IF NOT EXISTS agenda_schedule_kind varchar(4);
UPDATE property_visits SET agenda_schedule_kind=CASE WHEN visited_at AT TIME ZONE 'UTC'=date_trunc('day',visited_at AT TIME ZONE 'UTC') THEN 'date' ELSE 'time' END WHERE agenda_schedule_kind IS NULL;
ALTER TABLE property_visits ALTER COLUMN agenda_schedule_kind SET DEFAULT 'time';
ALTER TABLE property_visits ALTER COLUMN agenda_schedule_kind SET NOT NULL;
UPDATE maintenance_tickets SET metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object('agendaScheduleKind',CASE WHEN scheduled_at AT TIME ZONE 'UTC'=date_trunc('day',scheduled_at AT TIME ZONE 'UTC') THEN 'date' ELSE 'time' END) WHERE NOT(COALESCE(metadata,'{}'::jsonb) ? 'agendaScheduleKind');
-- Agenda tasks are canonical; legacy CRM fields are transactionally mirrored.
CREATE TABLE IF NOT EXISTS agenda_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 title varchar(200) NOT NULL, description text, kind varchar(20) NOT NULL DEFAULT 'task' CHECK(kind IN ('call','task','visit')),
 person_type varchar(20), person_id uuid, responsible_user_id uuid REFERENCES users(id),
 scheduled_date date, scheduled_at timestamptz, ends_at timestamptz,
 reminder_minutes integer NOT NULL DEFAULT 15 CHECK(reminder_minutes BETWEEN 0 AND 10080),
 reminder_hour integer NOT NULL DEFAULT 9 CHECK(reminder_hour BETWEEN 0 AND 23),
 status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
 source_type varchar(20), source_id uuid, related_entry_id varchar(160),
 created_by uuid REFERENCES users(id), source_communication_id uuid REFERENCES person_communications(id),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((person_type IS NULL)=(person_id IS NULL)), CHECK(person_type IN ('interested','tenant','owner','buyer','user')),
 CHECK(scheduled_date IS NULL OR scheduled_at IS NULL), CHECK(ends_at IS NULL OR (scheduled_at IS NOT NULL AND ends_at>scheduled_at)),
 UNIQUE(source_type,source_id)
);
CREATE INDEX IF NOT EXISTS agenda_tasks_company_schedule ON agenda_tasks(company_id,status,scheduled_date,scheduled_at);
CREATE INDEX IF NOT EXISTS agenda_tasks_person ON agenda_tasks(company_id,person_type,person_id);
CREATE TABLE IF NOT EXISTS agenda_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, company_id uuid NOT NULL, task_id uuid NOT NULL REFERENCES agenda_tasks(id),
 version integer NOT NULL, actor_id uuid, event varchar(20) NOT NULL, before_snapshot jsonb, after_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(task_id,version)
);
CREATE TABLE IF NOT EXISTS agenda_entry_settings (
 company_id uuid NOT NULL REFERENCES companies(id), entry_id varchar(160) NOT NULL,
 responsible_user_id uuid REFERENCES users(id), reminder_minutes integer NOT NULL DEFAULT 15 CHECK(reminder_minutes BETWEEN 0 AND 10080),
 reminder_hour integer NOT NULL DEFAULT 9 CHECK(reminder_hour BETWEEN 0 AND 23), version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,entry_id)
);
CREATE OR REPLACE FUNCTION agenda_import_activity(data jsonb, person_kind text, scoped_company uuid, scoped_person uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE task_id uuid; is_date boolean;
BEGIN
 IF data->>'type' NOT IN ('call','task','visit') OR data->'metadata' ? 'visitId' OR data->'metadata' ? 'deliveryId' THEN
   UPDATE agenda_tasks SET status='cancelled' WHERE source_type=person_kind AND source_id=(data->>'id')::uuid AND status<>'cancelled';
   RETURN;
 END IF;
 SELECT id INTO task_id FROM agenda_tasks WHERE source_type=person_kind AND source_id=(data->>'id')::uuid;
 task_id:=COALESCE(task_id,(data->'metadata'->>'agendaTaskId')::uuid,gen_random_uuid());
 IF EXISTS(SELECT 1 FROM agenda_tasks WHERE id=task_id AND (company_id<>scoped_company OR person_type IS DISTINCT FROM person_kind OR person_id IS DISTINCT FROM scoped_person OR (source_id IS NOT NULL AND source_id<>(data->>'id')::uuid))) THEN RAISE EXCEPTION 'Agenda activity scope mismatch'; END IF;
 is_date:=COALESCE(data->'metadata'->>'agendaScheduleKind'='date', (data->>'due_at')::timestamptz AT TIME ZONE 'UTC'=date_trunc('day',(data->>'due_at')::timestamptz AT TIME ZONE 'UTC'),false);
 INSERT INTO agenda_tasks(id,company_id,title,description,kind,person_type,person_id,scheduled_date,scheduled_at,status,source_type,source_id,created_by,created_at,updated_at)
 VALUES(task_id,scoped_company,data->>'subject',data->>'body',data->>'type',person_kind,scoped_person,
 CASE WHEN is_date THEN ((data->>'due_at')::timestamptz AT TIME ZONE 'UTC')::date END,
 CASE WHEN NOT is_date THEN (data->>'due_at')::timestamptz END,
 CASE WHEN data->>'deleted_at' IS NOT NULL THEN 'cancelled' ELSE data->>'status' END,
 person_kind,(data->>'id')::uuid,(data->>'created_by_user_id')::uuid,(data->>'created_at')::timestamptz,(data->>'updated_at')::timestamptz)
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,kind=excluded.kind,
 scheduled_date=excluded.scheduled_date,scheduled_at=excluded.scheduled_at,status=excluded.status,
 source_type=excluded.source_type,source_id=excluded.source_id,ends_at=CASE WHEN agenda_tasks.scheduled_at IS DISTINCT FROM excluded.scheduled_at THEN NULL ELSE agenda_tasks.ends_at END
 WHERE (agenda_tasks.title,agenda_tasks.description,agenda_tasks.kind,agenda_tasks.scheduled_date,agenda_tasks.scheduled_at,agenda_tasks.status,agenda_tasks.source_type,agenda_tasks.source_id) IS DISTINCT FROM (excluded.title,excluded.description,excluded.kind,excluded.scheduled_date,excluded.scheduled_at,excluded.status,excluded.source_type,excluded.source_id);
END $$;
-- Backfill before installing audit triggers: existing records do not generate a notification storm.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT a.*,p.company_id FROM interested_activities a JOIN interested_profiles p ON p.id=a.interested_profile_id LOOP
 PERFORM agenda_import_activity(to_jsonb(r),'interested',r.company_id,r.interested_profile_id::uuid); END LOOP;
 FOR r IN SELECT * FROM tenant_activities LOOP PERFORM agenda_import_activity(to_jsonb(r),'tenant',r.company_id,r.tenant_id::uuid); END LOOP;
 FOR r IN SELECT * FROM owner_activities LOOP PERFORM agenda_import_activity(to_jsonb(r),'owner',r.company_id,r.owner_id::uuid); END LOOP;
END $$;
CREATE OR REPLACE FUNCTION agenda_crm_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scoped_company uuid; person_id uuid; person_kind text; data jsonb;
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 person_kind:=CASE TG_TABLE_NAME WHEN 'interested_activities' THEN 'interested' WHEN 'tenant_activities' THEN 'tenant' ELSE 'owner' END;
 IF TG_OP='DELETE' THEN UPDATE agenda_tasks SET status='cancelled' WHERE source_type=person_kind AND source_id=(data->>'id')::uuid; RETURN OLD; END IF;
 IF person_kind='interested' THEN
 SELECT company_id INTO scoped_company FROM interested_profiles WHERE id=NEW.interested_profile_id;
 person_id:=NEW.interested_profile_id::uuid;
 ELSE scoped_company:=(data->>'company_id')::uuid; person_id:=(data->>(person_kind||'_id'))::uuid; END IF;
 PERFORM agenda_import_activity(data,person_kind,scoped_company,person_id);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agenda_changed ON interested_activities;
CREATE TRIGGER agenda_changed AFTER INSERT OR UPDATE OR DELETE ON interested_activities FOR EACH ROW EXECUTE FUNCTION agenda_crm_changed();
DROP TRIGGER IF EXISTS agenda_changed ON tenant_activities;
CREATE TRIGGER agenda_changed AFTER INSERT OR UPDATE OR DELETE ON tenant_activities FOR EACH ROW EXECUTE FUNCTION agenda_crm_changed();
DROP TRIGGER IF EXISTS agenda_changed ON owner_activities;
CREATE TRIGGER agenda_changed AFTER INSERT OR UPDATE OR DELETE ON owner_activities FOR EACH ROW EXECUTE FUNCTION agenda_crm_changed();
CREATE OR REPLACE FUNCTION agenda_task_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' THEN NEW.version:=OLD.version+1; NEW.updated_at:=now(); END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS agenda_version ON agenda_tasks;
CREATE TRIGGER agenda_version BEFORE UPDATE ON agenda_tasks FOR EACH ROW EXECUTE FUNCTION agenda_task_version();
CREATE OR REPLACE FUNCTION agenda_task_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid; due timestamptz; table_name text;
BEGIN
 actor:=NULLIF(current_setting('rent.agenda_actor',true),'')::uuid;
 INSERT INTO agenda_history(company_id,task_id,version,actor_id,event,before_snapshot,after_snapshot)
 VALUES(NEW.company_id,NEW.id,NEW.version,CASE WHEN TG_OP='INSERT' THEN COALESCE(actor,NEW.created_by) ELSE actor END,CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'updated' END,
 CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW));
 IF pg_trigger_depth()>1 OR NEW.source_id IS NULL THEN RETURN NEW; END IF;
 table_name:=CASE NEW.source_type WHEN 'interested' THEN 'interested_activities' WHEN 'tenant' THEN 'tenant_activities' WHEN 'owner' THEN 'owner_activities' END;
 IF table_name IS NOT NULL THEN
 due:=COALESCE(NEW.scheduled_at,NEW.scheduled_date::timestamp AT TIME ZONE 'UTC');
 EXECUTE format('UPDATE %I SET subject=$1,body=$2,type=$3::%I,status=$4::%I,due_at=$5,completed_at=CASE WHEN $4=''completed'' THEN COALESCE(completed_at,now()) ELSE NULL END,metadata=metadata||$6::jsonb,updated_at=now() WHERE id=$7',table_name,NEW.source_type||'_activity_type',NEW.source_type||'_activity_status')
 USING NEW.title,NEW.description,NEW.kind,NEW.status,due,jsonb_build_object('agendaTaskId',NEW.id,'agendaScheduleKind',CASE WHEN NEW.scheduled_date IS NOT NULL THEN 'date' ELSE 'time' END),NEW.source_id;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agenda_audit ON agenda_tasks;
CREATE TRIGGER agenda_audit AFTER INSERT OR UPDATE ON agenda_tasks FOR EACH ROW EXECUTE FUNCTION agenda_task_changed();
CREATE TABLE IF NOT EXISTS web_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),user_id uuid NOT NULL REFERENCES users(id),
 entry_id varchar(160) NOT NULL,event varchar(30) NOT NULL,version text NOT NULL,title varchar(200) NOT NULL,
 due_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz,cancelled_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,user_id,entry_id,event,version)
);
CREATE INDEX IF NOT EXISTS web_notifications_inbox ON web_notifications(company_id,user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),user_id uuid NOT NULL REFERENCES users(id),
 endpoint text NOT NULL UNIQUE,p256dh text NOT NULL,auth text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS web_push_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),notification_id uuid NOT NULL REFERENCES web_notifications(id),subscription_id uuid NOT NULL REFERENCES web_push_subscriptions(id) ON DELETE CASCADE,
 status varchar(20) NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_expires_at timestamptz,claim_token uuid,
 UNIQUE(notification_id,subscription_id)
);
CREATE TABLE IF NOT EXISTS agenda_notification_state (
 company_id uuid NOT NULL,entry_id varchar(160) NOT NULL,version text NOT NULL,PRIMARY KEY(company_id,entry_id)
);
CREATE OR REPLACE VIEW agenda_people AS
SELECT p.company_id,'interested'::text AS person_type,p.id::uuid AS person_id,concat_ws(' ',p.first_name,p.last_name) AS name,p.phone,p.email FROM interested_profiles p WHERE p.deleted_at IS NULL
UNION ALL SELECT p.company_id,'tenant',p.id::uuid,concat_ws(' ',u.first_name,u.last_name),u.phone,u.email FROM tenants p JOIN users u ON u.id=p.user_id AND u.company_id=p.company_id WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL
UNION ALL SELECT p.company_id,'owner',p.id::uuid,concat_ws(' ',u.first_name,u.last_name),u.phone,u.email FROM owners p JOIN users u ON u.id=p.user_id AND u.company_id=p.company_id WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL
UNION ALL SELECT p.company_id,'buyer',p.id::uuid,concat_ws(' ',u.first_name,u.last_name),u.phone,u.email FROM buyers p JOIN users u ON u.id=p.user_id AND u.company_id=p.company_id WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL
UNION ALL SELECT u.company_id,'user',u.id,concat_ws(' ',u.first_name,u.last_name),u.phone,u.email FROM users u WHERE u.deleted_at IS NULL AND (CASE WHEN cardinality(u.roles)>0 THEN u.roles ELSE ARRAY[u.role] END)::text[] && ARRAY['admin','staff'];
CREATE OR REPLACE VIEW agenda_entries AS
SELECT 'task:'||t.id AS entry_id,t.company_id,t.title,t.description,t.kind,t.person_type,t.person_id,t.responsible_user_id,t.scheduled_date,t.scheduled_at,t.ends_at,t.reminder_minutes,t.reminder_hour,t.status,t.version::text AS version,true AS editable,t.source_type,t.source_id,t.related_entry_id,t.updated_at
FROM agenda_tasks t
UNION ALL
SELECT 'visit:'||v.id,p.company_id,CASE WHEN v.kind::text='maintenance' THEN v.interested_name ELSE 'Visita · '||p.name END,v.comments,v.kind::text,'interested',v.interested_profile_id::uuid,NULL::uuid,CASE WHEN v.agenda_schedule_kind='date' THEN (v.visited_at AT TIME ZONE 'UTC')::date END,CASE WHEN v.agenda_schedule_kind<>'date' THEN v.visited_at END,NULL::timestamptz,15,9,CASE WHEN v.completed_at IS NULL THEN 'pending' ELSE 'completed' END,v.updated_at::text,false,'property',p.id::uuid,NULL::varchar,v.updated_at
FROM property_visits v JOIN properties p ON p.id=v.property_id WHERE p.deleted_at IS NULL
UNION ALL
SELECT 'maintenance:'||m.id,m.company_id,m.title,m.description,'maintenance',NULL::text,NULL::uuid,s.user_id::uuid,CASE WHEN m.metadata->>'agendaScheduleKind'='date' THEN (m.scheduled_at AT TIME ZONE 'UTC')::date END,CASE WHEN COALESCE(m.metadata->>'agendaScheduleKind','time')<>'date' THEN m.scheduled_at END,NULL::timestamptz,15,9,CASE WHEN m.status::text IN ('resolved','closed') THEN 'completed' WHEN m.status::text='cancelled' THEN 'cancelled' ELSE 'pending' END,m.updated_at::text,false,'maintenance',m.id::uuid,NULL::varchar,m.updated_at
FROM maintenance_tickets m LEFT JOIN staff s ON s.id=m.assigned_to_staff_id AND s.company_id=m.company_id AND s.deleted_at IS NULL WHERE m.deleted_at IS NULL
UNION ALL
SELECT 'lease:'||l.id,l.company_id,'Vencimiento de contrato · '||p.name,NULL::text,'lease',CASE WHEN l.tenant_id IS NOT NULL THEN 'tenant' WHEN l.buyer_id IS NOT NULL THEN 'buyer' ELSE 'owner' END,COALESCE(l.tenant_id::uuid,l.buyer_id::uuid,l.owner_id::uuid),NULL::uuid,l.end_date,NULL::timestamptz,NULL::timestamptz,15,9,CASE WHEN l.status::text='active' THEN 'pending' ELSE 'completed' END,l.updated_at::text,false,'lease',l.id::uuid,NULL::varchar,l.updated_at
FROM leases l JOIN properties p ON p.id=l.property_id AND p.company_id=l.company_id WHERE l.deleted_at IS NULL AND p.deleted_at IS NULL AND l.end_date IS NOT NULL AND l.status::text<>'draft'
UNION ALL
SELECT 'invoice:'||i.id,i.company_id,'Vencimiento de cobro · '||i.invoice_number,NULL::text,'invoice','tenant',l.tenant_id::uuid,NULL::uuid,i.due_date,NULL::timestamptz,NULL::timestamptz,15,9,CASE WHEN i.status::text='cancelled' THEN 'cancelled' WHEN i.status::text='paid' OR COALESCE(i.balance_due,i.total_amount-i.paid_amount)<=0 THEN 'completed' ELSE 'pending' END,i.updated_at::text,false,'invoice',i.id::uuid,NULL::varchar,i.updated_at
FROM invoices i JOIN leases l ON l.id=i.lease_id AND l.company_id=i.company_id WHERE i.deleted_at IS NULL AND l.deleted_at IS NULL AND i.status::text<>'draft';
ALTER TABLE agenda_notification_state ADD COLUMN IF NOT EXISTS snapshot jsonb;
INSERT INTO agenda_notification_state(company_id,entry_id,version)
 SELECT t.company_id,'task:'||t.id,t.version::text||':0:'||COALESCE(c.settings->>'timezone','America/Argentina/Buenos_Aires')||':'||t.reminder_minutes||':'||t.reminder_hour FROM agenda_tasks t JOIN companies c ON c.id=t.company_id ON CONFLICT DO NOTHING;


-- Preserve a baseline snapshot for migrated activities while retaining their original CRM records.
INSERT INTO agenda_history(company_id,task_id,version,actor_id,event,after_snapshot,created_at)
 SELECT t.company_id,t.id,t.version,t.created_by,'created',to_jsonb(t),t.created_at FROM agenda_tasks t
 WHERE NOT EXISTS(SELECT 1 FROM agenda_history h WHERE h.task_id=t.id) ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS web_push_deliveries_due ON web_push_deliveries(next_attempt_at) WHERE status IN ('queued','failed','processing');

CREATE TABLE IF NOT EXISTS agenda_entry_settings_history (
 company_id uuid NOT NULL REFERENCES companies(id),entry_id varchar(160) NOT NULL,version integer NOT NULL,actor_id uuid REFERENCES users(id),snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(company_id,entry_id,version)
);
