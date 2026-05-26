# Plan de Replatforming Total a Qdrant + Rust

## 1. Objetivo

Este documento redefine el objetivo original como un **replatforming completo** del sistema:

1. reemplazar PostgreSQL como storage primario por Qdrant;
2. reemplazar `backend/` NestJS + TypeScript por un backend Rust;
3. reemplazar `batch/` TypeScript por jobs batch en Rust;
4. reemplazar migraciones SQL y scripts DB-centric por manifests JSON y herramientas de bootstrap/backfill para Qdrant;
5. guardar imagenes de propiedades en storage local del host del backend y persistir en Qdrant solo metadata, descriptores normalizados y vectores.

No se trata de sumar Qdrant como indice secundario. Se asume una migracion total del runtime, del modelo de persistencia y del tooling operativo.

## 2. Estado actual del repo

El alcance real del cambio en este repo es alto y ya esta medido:

- `backend/` usa NestJS + TypeORM + PostgreSQL.
- `batch/` usa TypeScript + TypeORM compartiendo entidades del backend.
- hay `50` entidades TypeORM en `backend/src/**/entities/*.entity.ts`;
- hay `99` usos de `InjectRepository(...)` en `backend/src`;
- hay `51` consultas `AppDataSource.query(...)` en `batch/src`;
- hay `21` migraciones SQL en `migrations/*.sql`;
- la infraestructura local hoy gira alrededor de Postgres en `docker-compose.yml`, `Makefile`, `scripts/init-db.sql`, `scripts/reset-db.sh`, `scripts/reset_data.sql` y `backend/src/config/database.config.ts`.

Tambien hay un dominio amplio que no es solo search:

- identidad y permisos;
- propiedades, unidades y visitas;
- leases, contratos y renovaciones;
- invoices, payments, credit notes y cuentas corrientes;
- settlements, retenciones y reportes;
- AI, documents, maintenance, notifications y payment gateway.

Y ademas hay un requerimiento nuevo de producto:

- buscar propiedades desde texto libre del usuario;
- aprovechar las fotos cargadas de cada propiedad para el matching;
- usar OpenAI REST API para transformar texto e imagenes en consultas que Qdrant pueda resolver.

## 3. Alcance del replatforming

El plan cubre cuatro frentes en paralelo:

### 3.1 Backend

Migrar los modulos actuales a un API Rust con compatibilidad funcional:

- `auth`, `users`, `companies`
- `properties`, `documents`, `interested`, `owners`, `tenants`, `buyers`, `staff`
- `leases`, `maintenance`, `notifications`, `portals`, `digital-signatures`
- `payments`, `settlements`, `bank-accounts`, `payment-gateway`, `sales`, `dashboard`
- `ai`, `whatsapp`, `currencies`, `health`, `metrics`

### 3.2 Batch

Migrar los comandos batch actuales a Rust:

- `billing`
- `overdue`
- `reminders`
- `lease-renewal-alerts`
- `sync-indices`
- `sync-rates`
- `reports`
- `process-settlements`

### 3.3 Scripts y operaciones

Reemplazar scripts y tooling de SQL/Postgres por bootstrap, reset, seed, backup y healthcheck orientados a Qdrant.

### 3.4 Migraciones y datos

Convertir el directorio `migrations/` en una capa de manifests JSON versionados que:

- creen colecciones;
- creen payload indexes y aliases;
- ejecuten seeds;
- corran backfills;
- rearmen proyecciones;
- validen checksums, conteos e invariantes.

### 3.5 Media y busqueda multimodal

El plan tambien cubre:

- storage local de imagenes en el host del backend;
- pipeline de vision y normalizacion con OpenAI REST API;
- embeddings de catalogo y de consultas para Qdrant;
- recuperacion de propiedades por similitud semantica + filtros estructurados.

## 4. Principios de diseno

El replatforming se apoya en estas reglas:

1. **Strangler primero**: el sistema Rust nace en paralelo al sistema TypeScript; el cutover se hace por dominios.
2. **Qdrant como storage documental + vectorial**: los agregados viven como documentos; search y retrieval viven en colecciones especializadas.
3. **Proyecciones explicitas**: dashboards, reportes, vencimientos, cuentas corrientes y paneles dejan de ser queries ad hoc y pasan a read models materializados.
4. **Invariantes en codigo**: unicidad, consistencia, idempotencia, correlativos, reglas financieras y auditoria salen de SQL y pasan a servicios de aplicacion.
5. **JSON como contrato**: seeds, manifests, snapshots, audit events y data interchange se versionan en JSON.
6. **Imagenes binarias fuera de Qdrant**: Qdrant guarda payloads y vectores; los archivos fisicos viven en storage local administrado por el backend.
7. **OpenAI como capa de interpretacion**: OpenAI se usa por REST para vision, normalizacion y embeddings; no como storage principal del sistema.
8. **Paridad funcional antes de cleanup**: no se elimina nada de Postgres/TypeORM hasta tener shadow reads, drift bajo y jobs certificados.

## 5. Arquitectura objetivo

## 5.1 Estructura de repo recomendada

El layout objetivo recomendado es un workspace Rust paralelo al codigo actual:

```text
rust/
  Cargo.toml
  apps/
    api/
    batch/
    migrator/
  crates/
    domain/
    application/
    contracts/
    storage_qdrant/
    storage_local_media/
    projections/
    search/
    openai_gateway/
    events/
    auth/
    observability/
    config/
    test_support/
scripts/
  qdrant/
    bootstrap/
    seeds/
    manifests/
    reset-dev.sh
    healthcheck.sh
    backup.sh
migrations/
  qdrant/
    001_bootstrap_core/
    002_seed_demo/
    003_backfill_master_data/
    ...
  media/
    manifests/
  sql-archive/
```

Durante la transicion:

- `backend/` y `batch/` quedan en mantenimiento correctivo;
- el nuevo runtime se desarrolla en `rust/`;
- el frontend y mobile siguen consumiendo contratos HTTP compatibles.

## 5.2 API backend en Rust

El backend objetivo debe tener estas capas:

1. `domain`: agregados, value objects, invariantes y eventos de dominio.
2. `application`: command handlers, query handlers, policy services e idempotencia.
3. `storage_qdrant`: repositorios, serializers, mappers, aliases y cliente Qdrant.
4. `projections`: builders de read models y recalculo incremental.
5. `api`: routers HTTP, DTOs, auth middleware, OpenAPI y validacion.

Stack recomendado:

- framework HTTP: `axum`
- runtime async: `tokio`
- serializacion: `serde`
- observabilidad: `tracing`
- tests API: `reqwest` + integration tests
- cliente Qdrant: crate oficial o wrapper interno unico

## 5.3 Storage local de imagenes

Las imagenes de propiedades no deben vivir dentro de Qdrant. El modelo objetivo es:

1. archivo binario en filesystem local del host donde corre el backend;
2. metadata y referencias dentro del agregado `Property`;
3. descriptores textuales normalizados y vectores en Qdrant;
4. thumbnails y variantes derivadas tambien en storage local.

Layout sugerido:

```text
/var/lib/rent/media/
  properties/
    <property-id>/
      original/
      derived/
      manifests/
```

Cada imagen debe registrar como minimo:

1. `image_id`
2. `property_id`
3. `relative_path`
4. `mime_type`
5. `size_bytes`
6. `sha256`
7. `width`
8. `height`
9. `vision_status`
10. `embedding_status`

Reglas operativas:

1. guardar solo paths relativos dentro de Qdrant;
2. usar checksum para deduplicacion e idempotencia;
3. generar thumbnails y una variante optimizada para vision;
4. respaldar `media/` por separado de Qdrant;
5. validar en drift checks que todo archivo referenciado exista en disco.

## 5.4 Batch en Rust

El batch objetivo debe compartir crates con el backend:

1. comandos CLI chicos;
2. jobs idempotentes;
3. checkpoints persistidos;
4. coleccion de ejecuciones y errores;
5. reprocesamiento por rango, company y fecha.

Cada job debe poder correr:

- `dry-run`
- `single-company`
- `single-aggregate`
- `resume-from-checkpoint`
- `rebuild-projection`

## 5.5 Integracion con OpenAI REST API

La integracion con OpenAI se usara en dos pasos:

1. **Responses API** para interpretar texto e imagenes y producir una consulta o descriptor normalizado.
2. **Embeddings API** para vectorizar ese texto normalizado y consultarlo contra Qdrant.

Decisiones de integracion:

1. usar un crate `openai_gateway` unico;
2. enviar imagenes por URL local firmada, `file_id` o base64 segun el flujo;
3. persistir localmente el resultado normalizado que devuelve OpenAI;
4. no guardar binarios en OpenAI como sistema de record permanente;
5. versionar prompts, esquemas de salida y versiones de embeddings.

Pipeline de indexacion de propiedades:

1. operador carga fotos;
2. backend guarda los archivos en storage local;
3. backend llama a OpenAI Responses API para obtener caption, tags, atributos visuales y resumen inmobiliario;
4. backend compone un `property_search_document`;
5. backend llama a Embeddings API para vectorizar ese documento;
6. backend upsertea payload + vector en Qdrant.

Pipeline de busqueda:

1. usuario envia texto libre;
2. opcionalmente adjunta imagen de referencia;
3. backend llama a OpenAI Responses API para normalizar la intencion de busqueda;
4. backend llama a Embeddings API sobre la consulta textual final;
5. backend consulta Qdrant con similarity + filtros estructurados;
6. backend reranquea y responde propiedades candidatas.

## 6. Modelo de datos objetivo en Qdrant

## 6.1 Estrategia general

El sistema deja de pensar en tablas y pasa a pensar en:

1. **aggregate collections**
2. **read model collections**
3. **search/vector collections**
4. **audit/control collections**

Los agregados operativos viven como documentos completos y versionados. Las experiencias de busqueda, matching y AI viven en colecciones separadas para no mezclar concerns.

Para propiedades con fotos, la regla es:

1. binario en storage local;
2. metadata en agregados y read models;
3. descripciones visuales y embeddings en colecciones de search.

## 6.2 Envelope JSON comun

Todo documento persistido debe seguir un envelope comun:

```json
{
  "id": "lease:10000000-0000-0000-0000-000000000701",
  "aggregate": "lease",
  "schema_version": 1,
  "document_version": 42,
  "company_id": "10000000-0000-0000-0000-000000000001",
  "status": "active",
  "created_at": "2026-04-21T00:00:00Z",
  "updated_at": "2026-04-21T00:00:00Z",
  "checksum": "sha256:...",
  "refs": {
    "property_id": "property:...",
    "owner_id": "owner:...",
    "tenant_ids": ["tenant:..."]
  },
  "state": {},
  "derived": {},
  "audit": {
    "created_by": "user:...",
    "updated_by": "user:..."
  }
}
```

Campos obligatorios:

- `id`
- `aggregate`
- `schema_version`
- `document_version`
- `company_id`
- `checksum`
- `refs`
- `state`
- `derived`

En `Property`, `state.images` debe guardar referencias y descriptores, no binarios:

```json
{
  "images": [
    {
      "image_id": "propimg:123",
      "relative_path": "properties/property-123/original/front.jpg",
      "thumbnail_path": "properties/property-123/derived/front-thumb.webp",
      "sha256": "sha256:...",
      "vision_summary": "living luminoso con ventanales grandes y piso de madera",
      "vision_tags": ["living", "luminoso", "madera", "ventanales"],
      "embedding_version": 1
    }
  ]
}
```

## 6.3 Colecciones de agregados

Colecciones candidatas:

1. `companies_agg_v1`
2. `users_agg_v1`
3. `owners_agg_v1`
4. `tenants_agg_v1`
5. `buyers_agg_v1`
6. `staff_agg_v1`
7. `properties_agg_v1`
8. `leases_agg_v1`
9. `tenant_accounts_agg_v1`
10. `invoices_agg_v1`
11. `payments_agg_v1`
12. `credit_notes_agg_v1`
13. `settlements_agg_v1`
14. `bank_accounts_agg_v1`
15. `payment_gateway_transactions_agg_v1`
16. `documents_agg_v1`
17. `maintenance_tickets_agg_v1`
18. `notifications_agg_v1`
19. `portal_listings_agg_v1`
20. `sales_folders_agg_v1`
21. `sales_agreements_agg_v1`
22. `sales_receipts_agg_v1`
23. `currencies_agg_v1`
24. `whatsapp_messages_agg_v1`
25. `billing_jobs_agg_v1`

## 6.4 Colecciones de read models

Colecciones candidatas para consultas operativas:

1. `dashboard_rm_v1`
2. `property_search_rm_v1`
3. `property_timeline_rm_v1`
4. `tenant_due_rm_v1`
5. `tenant_account_rm_v1`
6. `owner_period_rm_v1`
7. `settlement_summary_rm_v1`
8. `lease_renewal_rm_v1`
9. `payment_panel_rm_v1`
10. `reports_rm_v1`
11. `maintenance_board_rm_v1`
12. `interested_matches_rm_v1`

## 6.5 Colecciones de media metadata

Colecciones auxiliares para media:

1. `property_media_meta_v1`
2. `media_processing_jobs_v1`
3. `media_derivatives_v1`

`property_media_meta_v1` guarda metadata operativa y de procesamiento, pero no el binario.

## 6.6 Colecciones vectoriales y de AI

Colecciones candidatas para retrieval:

1. `document_chunks_vec_v1`
2. `property_semantic_vec_v1`
3. `property_image_features_vec_v1`
4. `property_query_vec_v1`
5. `interested_profiles_vec_v1`
6. `maintenance_semantic_vec_v1`
7. `ai_memory_vec_v1`
8. `github_issue_previews_vec_v1`

`property_semantic_vec_v1` debe representar el documento de busqueda consolidado de la propiedad:

- texto manual cargado por el operador;
- descripcion estructurada del inmueble;
- resumen visual generado a partir de fotos;
- amenities y restricciones;
- contexto de zona cuando exista.

`property_image_features_vec_v1` debe representar embeddings por imagen o por conjunto visual relevante.

## 6.7 Colecciones de control

Colecciones de control operativo:

1. `audit_events_v1`
2. `idempotency_keys_v1`
3. `migration_runs_v1`
4. `projection_checkpoints_v1`
5. `job_runs_v1`
6. `drift_reports_v1`

## 6.8 Tenancy, IDs y versionado

Reglas comunes:

1. conservar UUIDs actuales cuando existan;
2. usar `company_id` como scope obligatorio en todas las colecciones de negocio;
3. usar `document_version` para optimistic concurrency;
4. usar `schema_version` para evolucion del payload;
5. usar `projection_version` en read models;
6. usar checksums para drift detection;
7. usar aliases para cambios de coleccion sin downtime.

## 6.9 Documento de busqueda de propiedades

Cada propiedad debe tener un `property_search_document` derivado, pensado para embedding y retrieval:

```json
{
  "property_id": "property:123",
  "company_id": "company:1",
  "query_text": "departamento 2 ambientes luminoso con balcon y cocina integrada, estilo moderno, apto mascotas",
  "hard_filters": {
    "operation": "rent",
    "currency": "ARS",
    "price": 850000,
    "bedrooms": 1,
    "bathrooms": 1,
    "allows_pets": true,
    "city": "Buenos Aires"
  },
  "visual_summary": {
    "style": ["moderno", "luminoso"],
    "spaces": ["living", "balcon", "cocina integrada"],
    "signals": ["ventanales amplios", "piso de madera clara"]
  }
}
```

Ese documento es el que debe convertirse a embedding para `property_semantic_vec_v1`.

## 6.10 Consulta multimodal de usuario

Cuando el usuario busque propiedades, el backend debe construir una `normalized_property_query` usando OpenAI:

1. input del usuario:
   - texto libre;
   - opcional imagen de referencia;
2. salida normalizada:
   - intencion inmobiliaria;
   - atributos duros;
   - atributos blandos;
   - resumen visual deseado;
   - exclusiones;
   - query textual final para embedding.

Ejemplo:

```json
{
  "operation": "rent",
  "must_have": ["luminoso", "balcon", "apto mascotas"],
  "nice_to_have": ["cocina integrada", "estilo moderno"],
  "avoid": ["oscuro", "alfombra"],
  "query_for_embedding": "departamento en alquiler luminoso con balcon, apto mascotas, estilo moderno y cocina integrada"
}
```

La busqueda final combina:

1. payload filters exactos;
2. similarity search sobre `property_semantic_vec_v1`;
3. opcional similarity adicional sobre `property_image_features_vec_v1`;
4. reranking final en backend.

## 7. Reemplazo de backend por olas

## 7.1 Ola A: core platform

Objetivo: levantar el backend Rust con capacidades basicas y endpoints de soporte.

Incluye:

- `health`
- `metrics`
- `auth`
- `users`
- `companies`
- guards, JWT, permisos e i18n basico
- `openai_gateway`
- `media_storage`

Entregables:

1. nuevo `apps/api` corriendo en paralelo;
2. login, refresh, profile y health listos en Rust;
3. contrato OpenAPI publicado;
4. auth contra Qdrant o adaptador temporal durante bootstrap;
5. cliente REST a OpenAI aislado y testeado;
6. storage local de media encapsulado.

## 7.2 Ola B: master data y CRM

Objetivo: migrar datos maestros y modulos con menor sensibilidad contable.

Incluye:

- `owners`
- `tenants`
- `buyers`
- `staff`
- `properties`
- `documents`
- `interested`
- `portals`
- `maintenance`

Entregables:

1. agregados documentales y search payloads;
2. busqueda hibrida property/interested;
3. timelines y paneles leyendo read models;
4. escrituras ya sin TypeORM;
5. upload de imagenes a storage local;
6. pipeline de vision + embeddings para propiedades.

## 7.3 Ola C: contratos y operaciones

Objetivo: mover el dominio contractual y operativo.

Incluye:

- `leases`
- `digital-signatures`
- `notifications`
- `whatsapp`
- `ai`

Entregables:

1. `Lease` como agregado completo;
2. renovaciones y templates denormalizados;
3. documents/contract render sobre snapshots;
4. AI retrieval usando colecciones vectoriales.

Esta ola tambien debe consolidar la busqueda multimodal:

1. normalizacion de consultas con OpenAI Responses API;
2. embeddings de consulta con OpenAI Embeddings API;
3. integracion Qdrant para propiedades por texto + imagen.

## 7.4 Ola D: financiero y cierre

Objetivo: migrar el nucleo mas sensible.

Incluye:

- `payments`
- `settlements`
- `bank-accounts`
- `payment-gateway`
- `sales`
- `currencies`
- `dashboard`

Entregables:

1. ledger y cuentas corrientes en documentos versionados;
2. correlativos, credit notes y reversos en servicios de aplicacion;
3. paneles financieros desde read models;
4. settlement processing listo para batch Rust.

## 8. Reemplazo de batch por olas

## 8.1 Estructura objetivo

`apps/batch` debe organizarse por comandos:

```text
rust/apps/batch/src/
  main.rs
  commands/
    billing.rs
    overdue.rs
    reminders.rs
    lease_renewal_alerts.rs
    sync_indices.rs
    sync_rates.rs
    reports.rs
    process_settlements.rs
  jobs/
  readers/
  writers/
```

Todos los comandos deben usar las mismas crates de dominio y storage que el backend.

Se agrega una familia de jobs orientados a media y search:

- `rebuild-property-vision`
- `rebuild-property-embeddings`
- `backfill-property-search-docs`

## 8.2 Olas batch

### Ola 1: jobs de referencia externa

Migrar primero:

- `sync-indices`
- `sync-rates`

Motivo: tienen menor acople a invariantes financieras internas.

### Ola 2: jobs operativos simples

Migrar despues:

- `reminders`
- `lease-renewal-alerts`
- `overdue`

Motivo: leen proyecciones y ejecutan acciones idempotentes.

### Ola 3: jobs financieros

Migrar al final:

- `billing`
- `reports`
- `process-settlements`

Motivo: dependen de read models exactos, correlativos y consistencia por periodo.

## 8.3 Reglas batch obligatorias

Cada job debe:

1. persistir `job_run_id`;
2. guardar checkpoint por company y cursor;
3. soportar reintento sin duplicar efectos;
4. emitir eventos de auditoria;
5. producir resumen JSON de salida;
6. correr contra staging shadow antes de cutover;
7. soportar reproceso de media por `property_id` o `image_id`.

## 9. Scripts y tooling a reemplazar

## 9.1 Mapa de reemplazo

El reemplazo minimo esperado es este:

- `docker-compose.yml`
  - agregar `qdrant`
  - luego remover `postgres` y `pgadmin`
- `backend/src/config/database.config.ts`
  - reemplazar por configuracion Rust/Qdrant
- `batch/src/shared/database.ts`
  - reemplazar por cliente Rust/Qdrant
- `scripts/init-db.sql`
  - reemplazar por `scripts/qdrant/bootstrap/*.json`
- `storage de media local`
  - crear bootstrap de directorios, permisos y backups
- `scripts/reset-db.sh`
  - reemplazar por `scripts/qdrant/reset-dev.sh`
- `scripts/reset_data.sql`
  - reemplazar por `scripts/qdrant/seeds/demo/*.json`
- `scripts/healthcheck.sh`
  - extender y luego reemplazar por healthcheck Qdrant-aware
- `backend/scripts/db-tunnel.sh`
  - reemplazar por script de tunnel Qdrant o eliminar
- `Makefile`
  - cambiar `db-*` por `qdrant-*`, `bootstrap-*`, `seed-*`, `backfill-*`

## 9.2 Scripts nuevos requeridos

Se recomienda crear como minimo:

1. `scripts/qdrant/bootstrap-collections.sh`
2. `scripts/qdrant/bootstrap-indexes.sh`
3. `scripts/qdrant/reset-dev.sh`
4. `scripts/qdrant/load-seeds.sh`
5. `scripts/qdrant/healthcheck.sh`
6. `scripts/qdrant/backup.sh`
7. `scripts/qdrant/restore.sh`
8. `scripts/qdrant/run-backfill.sh`
9. `scripts/qdrant/run-drift-check.sh`
10. `scripts/qdrant/rebuild-projections.sh`
11. `scripts/qdrant/rebuild-property-search.sh`
12. `scripts/media/bootstrap-storage.sh`
13. `scripts/media/backup-storage.sh`
14. `scripts/media/verify-storage.sh`

## 9.3 Makefile objetivo

Targets sugeridos:

1. `make qdrant-up`
2. `make qdrant-reset`
3. `make qdrant-bootstrap`
4. `make qdrant-seed`
5. `make qdrant-healthcheck`
6. `make qdrant-backup`
7. `make qdrant-restore FILE=...`
8. `make backfill DOMAIN=leases`
9. `make rebuild-projections DOMAIN=payments`
10. `make drift-check`
11. `make media-bootstrap`
12. `make media-backup`
13. `make property-search-rebuild`

## 10. Migraciones SQL -> manifests JSON

## 10.1 Cambio de modelo

`migrations/*.sql` deja de ser runtime input. El nuevo sistema de migraciones trabaja con manifests JSON versionados por carpeta.

Estructura sugerida:

```text
migrations/qdrant/
  001_bootstrap_core/
    manifest.json
    collections.json
    payload_indexes.json
    aliases.json
    verify.json
  002_seed_demo/
    manifest.json
    seed_companies.json
    seed_users.json
    seed_properties.json
  003_backfill_master_data/
    manifest.json
    extract.json
    transform.json
    upsert.json
    verify.json
```

## 10.2 Tipos de manifest

Se necesitan cuatro tipos de manifests:

1. **bootstrap**: crea colecciones, aliases y payload indexes;
2. **seed**: inserta demo data y fixtures;
3. **backfill**: migra datos desde Postgres exportado;
4. **projection-rebuild**: reconstruye read models.
5. **media-rebuild**: reanaliza imagenes y regenera descriptores y embeddings.

## 10.3 Ejemplo de manifest

```json
{
  "migration_id": "003_backfill_leases",
  "kind": "backfill",
  "depends_on": ["001_bootstrap_core", "002_seed_demo"],
  "source": {
    "type": "postgres-export",
    "input": "exports/leases.ndjson"
  },
  "target": {
    "collection": "leases_agg_v1",
    "alias": "leases_agg"
  },
  "transform": {
    "builder": "lease_aggregate_v1",
    "schema_version": 1
  },
  "verify": {
    "count_match": true,
    "checksum": true,
    "company_scope": true
  }
}
```

## 10.4 Archivo SQL historico

Las `21` migraciones SQL actuales no se borran al inicio. Se mueven a `migrations/sql-archive/` cuando:

1. el backfill ya no depende de queries SQL en runtime;
2. el entorno local ya no necesita `psql`;
3. staging y produccion ya operan sobre Qdrant.

## 11. Estrategia de migracion de datos

## 11.1 Pipeline oficial

El pipeline de migracion debe ser unico y repetible:

1. `extract`
2. `normalize`
3. `denormalize`
4. `build-aggregate-json`
5. `build-read-model-json`
6. `embed`
7. `upsert`
8. `verify`
9. `drift-check`

## 11.2 Herramienta de migracion

Se recomienda construir `rust/apps/migrator` para evitar scripts sueltos.

Capacidades minimas:

1. exportar por dominio o company;
2. leer SQL exports, CSV o NDJSON;
3. materializar JSON versionado;
4. calcular embeddings donde corresponda;
5. hacer upsert masivo a Qdrant;
6. validar conteos, checksums e invariantes;
7. registrar corrida en `migration_runs_v1`.

Tambien debe poder:

1. recorrer storage local de imagenes;
2. regenerar captions y resumenes con OpenAI;
3. regenerar embeddings de propiedades;
4. validar que toda imagen referenciada exista en disco.

## 11.3 Orden de backfill

Orden recomendado:

1. `companies`, `users`, `owners`, `tenants`, `buyers`, `staff`
2. `properties`, `documents`, `property_images`, `property_visits`
3. `interested_profiles`, `interested_activities`, `reservations`
4. `leases`, `templates`, `amendments`
5. `tenant_accounts`, `invoices`, `payments`, `credit_notes`
6. `bank_accounts`, `settlements`, `payment_gateway_transactions`
7. `maintenance`, `notifications`, `portals`
8. `sales`
9. `dashboard` y read models cruzados
10. `document_chunks`, `ai_memory`, colecciones vectoriales

Para `properties` el backfill debe incluir:

1. mover binarios a storage local;
2. generar metadata JSON por imagen;
3. generar `property_search_document`;
4. generar embeddings y upserts en colecciones vectoriales.

## 11.4 Drift y reconciliacion

Antes de cualquier corte productivo debe existir:

1. shadow reads por endpoint critico;
2. reconciliacion de montos por company y periodo;
3. reconciliacion de correlativos;
4. reconciliacion de leases activos por propiedad;
5. reconciliacion de settlement neto vs detalle;
6. comparacion de paneles y reportes exportados;
7. verificacion de existencia fisica de imagenes referenciadas;
8. verificacion de sincronizacion entre media metadata y vectores en Qdrant.

## 12. Fases del programa

## Fase 0. ADR, inventory y freeze de cambios estructurales

Salida:

1. ADR aprobado;
2. inventario de entidades, endpoints, jobs y scripts;
3. criterios de aceptacion por dominio;
4. lista de invariantes financieras y operativas.

## Fase 1. Workspace Rust y Qdrant base

Trabajo:

1. crear `rust/` workspace;
2. agregar servicio `qdrant` a `docker-compose.yml`;
3. agregar config, observabilidad y cliente unico;
4. crear `apps/api`, `apps/batch`, `apps/migrator`;
5. crear bootstrap de storage local para media;
6. agregar gateway REST a OpenAI.

Salida:

1. API Rust responde health;
2. batch Rust corre un comando dummy;
3. Qdrant bootstrap reproducible en local;
4. storage local de imagenes listo para pruebas.

## Fase 2. JSON schema y motor de manifests

Trabajo:

1. definir envelope comun;
2. definir manifests JSON;
3. crear ejecutor de migraciones JSON;
4. definir aliases, indexes y seeds;
5. definir manifests de media y property search.

Salida:

1. `001_bootstrap_core` operativo;
2. `002_seed_demo` operativo;
3. manifests de media y property search operativos;
4. repositorio listo para evolucion sin SQL.

## Fase 3. Core platform en Rust

Trabajo:

1. auth, users, companies, health, metrics;
2. JWT, roles y permissions;
3. test harness de API;
4. primer shadow traffic de endpoints simples;
5. integracion OpenAI y media storage funcional.

Salida:

1. login y profile en Rust;
2. TypeScript sigue vivo pero ya no es el unico entrypoint.

## Fase 4. Master data, properties y CRM

Trabajo:

1. owners, tenants, buyers, staff;
2. properties, units, images, visits;
3. documents, interested, maintenance, portals;
4. search y matching sobre Qdrant;
5. captions y resumenes de imagenes con OpenAI;
6. storage local de fotos productivo.

Salida:

1. ola B completa;
2. frontend puede leer/escribir via API Rust en dominios comerciales.

## Fase 5. Leases, contratos y AI

Trabajo:

1. leases y amendments;
2. templates y digital signatures;
3. notifications, whatsapp;
4. documents chunks y AI memory.

Salida:

1. contratos y renovaciones ya corren sobre agregados Qdrant;
2. retrieval AI ya no depende del backend TS.

## Fase 6. Financiero y proyecciones

Trabajo:

1. tenant accounts y ledger;
2. invoices, payments, credit notes;
3. settlements, bank accounts, payment gateway;
4. sales;
5. read models financieros y dashboard.

Salida:

1. dominio financiero migrado;
2. reconciliacion automatizada habilitada.

## Fase 7. Batch Rust

Trabajo:

1. migrar jobs por olas;
2. job runs, checkpoints e idempotencia;
3. reportes y settlements sobre read models;
4. corrida paralela TS vs Rust;
5. jobs de rebuild de media y property search.

Salida:

1. batch Rust cubre todos los comandos;
2. batch TS queda listo para retiro.

## Fase 8. Shadow reads, dual-write y certificacion

Trabajo:

1. dual-write desde TS o adaptador de transicion;
2. comparar respuestas por endpoint;
3. comparar salidas batch por job y fecha;
4. cerrar drift residual.

Salida:

1. mismatch bajo y explicado;
2. corte listo por dominio.

## Fase 9. Cutover

Trabajo:

1. freeze temporal de schema funcional;
2. backfill final;
3. promover API Rust y batch Rust;
4. Postgres queda en solo lectura durante la ventana de observacion.

Salida:

1. trafico primario sobre Rust + Qdrant;
2. rollback aun posible durante la ventana acordada.

## Fase 10. Cleanup final

Trabajo:

1. eliminar `backend/` y `batch/` si ya no se necesitan;
2. archivar SQL migrations;
3. limpiar `Makefile`, docs y CI;
4. eliminar dependencias `typeorm`, `pg`, `@nestjs/typeorm`.

Salida:

1. no queda runtime productivo ligado a PostgreSQL.

## 13. Criterios de aceptacion

Cada dominio se considera migrado cuando cumple todo esto:

1. API Rust expone los endpoints necesarios;
2. escrituras y lecturas van a Qdrant;
3. hay tests unitarios, integracion y shadow comparison;
4. hay manifests JSON para bootstrap y backfill;
5. el batch relacionado ya no usa SQL;
6. observabilidad, backup y restore estan definidos;
7. el dominio paso reconciliacion funcional;
8. si usa imagenes, las fotos existen en storage local y sus vectores estan sincronizados.

Para finanzas, ademas:

1. mismatch monetario igual a cero en escenarios certificados;
2. correlativos consistentes;
3. settlement neto reconciliado;
4. ledger reproducible desde eventos o snapshots.

## 14. Riesgos criticos

Los riesgos mayores del replatforming siguen siendo:

1. perder consistencia financiera al salir de un modelo relacional;
2. subestimar el trabajo de read models y reconciliacion;
3. migrar lenguaje, storage y modelo de datos demasiado rapido;
4. mezclar agregados operativos con colecciones vectoriales sin separacion clara;
5. dejar scripts de bootstrap/backfill sin un runner unico y reproducible;
6. cortar Postgres antes de tener drift controlado;
7. depender de captions pobres o inconsistentes para el search visual;
8. no versionar la normalizacion OpenAI y perder comparabilidad entre embeddings viejos y nuevos.

## 15. Orden recomendado de ejecucion real

La secuencia menos riesgosa para este repo es:

1. workspace Rust + Qdrant local
2. storage local de media + gateway OpenAI
3. motor de manifests JSON
4. core platform Rust
5. master data + properties + CRM
6. leases + documents + AI
7. read models financieros
8. batch Rust
9. dual-write y shadow reads
10. cutover
11. cleanup final

No conviene arrancar por:

1. `payments` y `settlements` como primera ola;
2. borrar TypeORM antes de tener API Rust estable;
3. borrar scripts SQL antes de tener manifests y seeds equivalentes;
4. apagar Postgres antes de certificar batch y reconciliacion;
5. intentar buscar por imagen sin una capa de normalizacion visual consistente.

## 16. Primer backlog recomendado

Si hubiera que arrancar mañana, las primeras tareas concretas deberian ser:

1. agregar `qdrant` a `docker-compose.yml` y crear `scripts/qdrant/healthcheck.sh`;
2. crear `scripts/media/bootstrap-storage.sh` y definir el directorio local de imagenes;
3. crear `rust/` workspace con `apps/api`, `apps/batch`, `apps/migrator`;
4. definir envelope JSON comun y `001_bootstrap_core`;
5. crear aliases y colecciones `*_agg_v1`, `*_rm_v1`, `*_vec_v1`, `audit_events_v1`, `migration_runs_v1`;
6. implementar gateway OpenAI REST para Responses API y Embeddings API;
7. migrar `auth` + `health` + `companies` como ola piloto;
8. crear primer backfill `companies/users/owners/tenants/properties` a JSON + upsert Qdrant;
9. construir `job_runs_v1` y migrar `sync-rates` como primer job Rust;
10. agregar drift checks automáticos para `companies`, `users`, `properties` y `property_media_meta`.

## 17. Resultado esperado

Al final del programa, el repo deberia quedar asi:

1. backend y batch productivos escritos en Rust;
2. Qdrant como storage primario, de proyecciones y de retrieval;
3. imagenes de propiedades guardadas en storage local del host backend;
4. OpenAI REST API integrada para normalizacion multimodal y embeddings de consulta;
5. migraciones, seeds y backfills definidos como manifests JSON;
6. scripts operativos y `Makefile` ya sin dependencia de SQL;
7. `migrations/sql-archive/` preservado solo como referencia historica.
