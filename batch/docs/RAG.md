# Operación del batch RAG

El batch genera chunks canónicos para propiedades, documentos aprobados,
contratos, facturas/pagos, portfolios de propietarios, cuentas de inquilino,
interesados y actividades. Obtiene embeddings con OpenAI y los persiste en
`ai_knowledge_chunks`. El proceso usa paginación por UUID, checkpoints
persistentes e idempotencia por hash, modelo y versión.

## Contrato de las proyecciones

| Proyección | Incluye | Excluye deliberadamente |
|---|---|---|
| `property_summary` | descripción, ubicación, tipo, comodidades, garantías y características | precios y credenciales |
| `document_chunk` | texto aprobado/contractual normalizado y metadata de relación | binarios, URLs firmadas y metadata secreta |
| `lease_summary` | participantes, propiedad, términos y cláusulas | montos, estado y fechas vigentes |
| `invoice_payment_summary` | relación factura/contrato/propiedad y medios de pagos relacionados | importes, estados, fechas y datos bancarios |
| `owner_portfolio_summary` | nombre, propiedades, tipos y ciudades | datos fiscales y bancarios |
| `tenant_account_summary` | relación inquilino/contrato/propiedad y notas | saldo, moneda, documentos y datos laborales |
| `interested_profile_summary` | preferencias, zonas, mascotas, garantías y calificación | teléfono, email, presupuesto y consentimiento |
| `activity_chunk` | tipo, asunto y cuerpo de actividades | metadata arbitraria, contactos y secretos |

Los valores financieros, estados y fechas se obtienen únicamente mediante las
consultas SQL registradas del backend; nunca se consideran hechos a partir de
estas proyecciones semánticas.

## Configuración

Variables obligatorias para una carga real:

```dotenv
OPENAI_API_KEY=...
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_EMBEDDING_DIMENSIONS=1536
AI_EMBEDDING_VERSION=1
```

También se pueden ajustar `AI_EMBEDDING_REQUEST_BATCH_SIZE`, `AI_EMBEDDING_MAX_ATTEMPTS`, `AI_EMBEDDING_TIMEOUT_MS` y, para un proxy compatible, `OPENAI_BASE_URL`.

## Secuencia inicial

Compilar y comprobar qué entidades cambiarían sin consumir la API ni escribir:

```bash
cd batch
npm ci
npm run build
node dist/index.js rag-backfill --entity all --batch-size 50 --concurrency 2 --dry-run
```

Ejecutar la carga real y verificarla:

```bash
node dist/index.js rag-backfill --entity all --batch-size 50 --concurrency 2
node dist/index.js rag-verify --entity all --sample-size 1000
```

`rag-verify` sale con código distinto de cero si encuentra chunks faltantes, desactualizados, huérfanos, embeddings inválidos o fallas de autoconsistencia.

Crear HNSW únicamente después de una verificación limpia:

```bash
node dist/index.js rag-build-index
node dist/index.js rag-recall --sample-size 100 --k 8 --min-recall 0.95
```

El comando rechaza crear el índice si todavía no hay chunks activos o alguno no tiene embedding. El índice se crea concurrentemente y luego se ejecuta `ANALYZE`.
En producción debe ejecutarse con el rol de migraciones o administración que sea propietario de la tabla; el usuario de aplicación no necesita permisos DDL.

`rag-recall` deshabilita índices dentro de una transacción para obtener los
vecinos exactos y los compara con HNSW. Falla si no hay una muestra evaluable o
si cualquier consulta queda por debajo del recall mínimo.

## Reanudación y mantenimiento

Cada lote confirmado actualiza `ai_rag_backfill_checkpoints`; al completar una fuente, elimina su checkpoint. Una nueva ejecución omite contenido cuyo hash, modelo y versión no cambiaron. Para comenzar después de un UUID concreto se puede pasar `--checkpoint <uuid>`; `--force` recalcula todos los embeddings seleccionados.

Los chunks que desaparecen de una proyección se retiran mediante `deleted_at`. Su purga física es explícita:

```bash
node dist/index.js rag-purge-stale --older-than 2026-08-01T00:00:00Z --dry-run
node dist/index.js rag-purge-stale --older-than 2026-08-01T00:00:00Z
```

La retención de ejecuciones RAG, comparaciones shadow, confirmaciones de
mutaciones y eventos procesados del outbox es idempotente:

```bash
node dist/index.js rag-purge-audit --dry-run
node dist/index.js rag-purge-audit
```

El corte predeterminado es `AI_RAG_AUDIT_RETENTION_DAYS=90`. Los eventos
pendientes, en procesamiento o fallidos nunca se eliminan por esta política.

Los comandos aceptan `--company-id <uuid>` para limitar el alcance a una empresa.

## Sincronización online

Las migraciones `089` y `091` generan eventos dentro de la misma transacción
para todas las fuentes y dependencias. Cuando una fuente se elimina o una
dependencia puede invalidar su documento, el chunk se retira sincrónicamente;
el retriever además contrasta existencia y `updated_at` operativos antes de
generar. No se llama a OpenAI desde el request del backend.

El worker continuo reclama eventos mediante `FOR UPDATE SKIP LOCKED`, compacta cambios de una misma entidad, relee la fuente actual y recupera locks abandonados:

```bash
node dist/index.js rag-sync --batch-size 50 --worker-id rent-rag-worker-1
```

Para pruebas o ejecución puntual:

```bash
node dist/index.js rag-sync --once --batch-size 50
```

Los errores se reprograman con backoff exponencial y pasan a `failed` después de `AI_OUTBOX_MAX_ATTEMPTS`. Un evento de eliminación retira inmediatamente los chunks activos de la entidad.

La reconciliación incremental nocturna repara divergencias aunque se haya perdido un evento y termina ejecutando la verificación completa:

```bash
node dist/index.js rag-reconcile --entity all --sample-size 1000
```

El despliegue administra `rag-sync` con PM2 y programa `rag-reconcile` a las 02:30 mediante cron.
