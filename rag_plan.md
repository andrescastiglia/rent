# Plan compacto de RAG sobre PostgreSQL + pgvector

## 1. Objetivo

Migrar el chat AI de RentFlow desde tool calling directo a una arquitectura RAG
híbrida, manteniendo NestJS como frontera de autenticación, autorización,
auditoría y acceso a los servicios de dominio.

La solución debe:

1. usar pgvector para recuperación semántica;
2. usar SQL parametrizado para montos, estados, fechas y agregaciones;
3. aislar siempre por empresa, rol y usuario;
4. exigir fuentes válidas para toda afirmación factual;
5. abstenerse cuando la evidencia no sea suficiente;
6. sincronizar altas, cambios y eliminaciones dentro del SLA;
7. conservar las mutaciones en servicios de dominio con confirmación;
8. permitir rollback inmediato al chat basado en tools.

RAG es una capacidad de lectura. El modelo no recibe credenciales, no ejecuta
SQL libre y no escribe directamente en tablas operativas.

## 2. Arquitectura

~~~text
Frontend
  -> POST /ai/respond
  -> JWT + contexto de empresa, usuario, rol y permisos
  -> clasificador de intención
       -> structured: consultas SQL registradas y parametrizadas
       -> semantic: PostgreSQL + pgvector
       -> hybrid: ambas fuentes
       -> mutation: tools y servicios de dominio
  -> filtro de autorización y frescura
  -> generador con Structured Outputs
  -> verificador de citas y evidencia
  -> conversación + auditoría
~~~

Componentes principales:

- backend/src/ai/rag: clasificación, retrieval, generación y validación;
- batch/src/services/rag: embeddings, backfill, outbox, reconciliación y
  verificación;
- ai_knowledge_chunks: proyección semántica;
- ai_embedding_outbox: sincronización transaccional;
- ai_rag_runs: auditoría de lecturas;
- ai_rag_shadow_comparisons: comparación privada entre tools y RAG.

## 3. Principios obligatorios

### Autorización

- companyId, userId, role y permisos provienen exclusivamente del JWT.
- ADMIN continúa limitado a su empresa.
- STAFF respeta permisos de módulos.
- OWNER sólo accede a sus propiedades, contratos y relaciones.
- TENANT sólo accede a su contrato, propiedad y cuenta.
- El prompt nunca puede modificar el alcance.
- Toda fuente recuperada se vuelve a validar antes de generar.

### Evidencia

- Los vectores sirven para descripción y búsqueda semántica.
- Montos, saldos, conteos, fechas y estados sólo provienen de SQL actual.
- Cada claim debe citar sourceIds recuperados y autorizados.
- Una cita inventada o una respuesta factual sin claims produce abstención.
- El contenido recuperado se trata como dato no confiable y no como
  instrucciones.

### Escrituras

- Ninguna mutación usa RAG ni SQL generado.
- Las mutaciones pasan por tools y servicios de dominio.
- La implementación completa debe exigir confirmación explícita y auditable
  antes de ejecutar cualquier cambio.

## 4. Datos y sincronización

### Esquema implementado

- ai_knowledge_chunks con hashes, versión, metadata y vector(1536);
- ai_embedding_outbox con compactación, locks y reintentos;
- ai_rag_runs sin almacenar prompts completos;
- ai_rag_backfill_checkpoints;
- ai_rag_shadow_comparisons con hashes, latencias y estado, sin texto.

Índices:

- B-tree por empresa y entidad;
- GIN sobre metadata;
- HNSW con vector_cosine_ops;
- índices de eventos pendientes, locks y auditoría.

### Proyecciones actuales

Implementadas:

- property_summary;
- document_chunk;
- lease_summary;
- invoice_payment_summary;
- owner_portfolio_summary;
- tenant_account_summary;
- interested_profile_summary;
- activity_chunk.

Ventas, mantenimiento y cualquier otra entidad futura deben incorporarse sólo
después de definir su proyección canónica, dependencias, autorización y matriz
de evaluación.

### Flujo online

1. Los triggers insertan eventos en el outbox dentro de la transacción.
2. El worker reclama con FOR UPDATE SKIP LOCKED.
3. Compacta eventos de la misma entidad.
4. Relee la fuente operativa.
5. Reconstruye el documento canónico.
6. Omite contenido cuyo hash, modelo y versión no cambiaron.
7. Actualiza o elimina lógicamente los chunks.
8. Reintenta errores transitorios y recupera locks expirados.
9. La reconciliación nocturna detecta divergencias.

Objetivo de frescura: menos de 60 segundos. Para considerar la migración
completa, una eliminación debe quedar excluida inmediatamente o el retriever
debe comprobar la entidad operativa antes de devolverla.

## 5. API y modos de rollout

Endpoints:

- POST /ai/respond: contrato principal;
- POST /ai/tools/respond: alias temporal compatible.

Respuesta:

- conversationId;
- model;
- outputText;
- insufficientEvidence;
- sources con IDs, tipo, entidad, etiqueta y fecha;
- estrategia y cantidad recuperada;
- uso de tokens.

Modos:

| Modo | Comportamiento |
|---|---|
| TOOLS | Chat legado y rollback |
| RAG_SHADOW | Ejecuta ambos caminos y muestra tools |
| RAG_READ | RAG para lecturas y tools para mutaciones |
| HYBRID | RAG híbrido y retiro selectivo de tools de lectura |

Controles:

- AI_RAG_ENABLED_COMPANY_IDS limita el rollout por empresa;
- un modo inválido o una empresa no incluida vuelve a TOOLS;
- AI_RAG_RETIRED_READ_TOOLS sólo se aplica en HYBRID;
- volver a TOOLS reactiva el catálogo completo.

## 6. Configuración principal

~~~dotenv
OPENAI_MODEL=gpt-4o-mini
AI_RAG_MODEL=gpt-4o-mini
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_EMBEDDING_DIMENSIONS=1536
AI_EMBEDDING_VERSION=1
AI_RAG_MIN_SIMILARITY=0.35
AI_RAG_TOP_K=8
AI_RAG_FINAL_K=8
AI_RAG_STRUCTURED_LIMIT=20
AI_RAG_TIMEOUT_MS=60000
AI_EMBEDDING_MAX_ATTEMPTS=5
AI_EMBEDDING_RETRY_BASE_MS=250
AI_RAG_MAX_OUTPUT_TOKENS=1200
AI_RAG_MAX_CONTEXT_CHARS=40000
AI_RAG_MIN_SIMILARITY_BY_PROJECTION=
AI_MUTATION_CONFIRMATION_TTL_SECONDS=900
AI_RAG_AUDIT_RETENTION_DAYS=90

AI_RETRIEVAL_MODE=TOOLS
AI_RAG_ENABLED_COMPANY_IDS=
AI_RAG_RETIRED_READ_TOOLS=

AI_OUTBOX_BATCH_SIZE=50
AI_OUTBOX_MAX_ATTEMPTS=8
AI_OUTBOX_LOCK_TIMEOUT_MS=300000
AI_OUTBOX_POLL_INTERVAL_MS=5000
AI_OUTBOX_FRESHNESS_SLA_SECONDS=60
~~~

El umbral de similitud debe recalibrarse cuando cambien el corpus, el modelo o
las proyecciones.

## 7. Operación

Comandos:

~~~bash
node dist/index.js rag-backfill --entity all --batch-size 50 --concurrency 2
node dist/index.js rag-sync --once --batch-size 50
node dist/index.js rag-verify --entity all --sample-size 1000
node dist/index.js rag-reconcile --entity all
node dist/index.js rag-build-index
node dist/index.js rag-recall --sample-size 100 --k 8 --min-recall 0.95
node dist/index.js rag-purge-audit --dry-run
~~~

Evaluación:

~~~bash
npm run rag:eval -- --report /tmp/rag-eval.json --strict
npm run rag:eval -- --case-id admin-01 --debug
npm run rag:eval -- --role owner
npm run rag:eval -- --category adversarial --strict
npm run rag:shadow-report -- --hours 24
~~~

Rollback:

1. cambiar AI_RETRIEVAL_MODE a TOOLS;
2. reiniciar el backend con el entorno actualizado;
3. conservar tablas, chunks y auditoría para diagnóstico;
4. no eliminar pgvector durante el rollback funcional.

## 8. Estado comprobado en oracle

Infraestructura:

- PostgreSQL 17.9 con PostGIS 3.5.3 y pgvector 0.8.5;
- índice HNSW activo;
- backend y rent-rag-worker online;
- reconciliación nocturna configurada;
- purga de auditoría semanal configurada;
- backup actual restaurado y verificado en una base aislada.

Datos actuales:

- 24 chunks activos distribuidos en siete proyecciones;
- 7 property_summary, 2 document_chunk, 1 lease_summary,
  5 owner_portfolio_summary, 1 tenant_account_summary,
  6 interested_profile_summary y 2 activity_chunk;
- 24 de 24 chunks con embedding;
- 0 chunks sin embedding;
- 0 chunks stale;
- outbox sin pendientes ni fallidos al verificar;
- dos backfills consecutivos procesaron 24 fuentes, generaron 0 embeddings y
  omitieron correctamente los 24 chunks sin cambios;
- rag-verify comprobó 24 chunks con 0 missing, stale, orphaned, dimensiones
  inválidas o fallas de autoconsistencia;
- recall exacto contra HNSW: promedio 1, mínimo 1, 0 fallas en 24 muestras.

Recuperación:

- backup actual:
  rent_db_rag_closure_20260729T201200Z.dump;
- restauración aislada: rent_2026q3_restore_drill;
- RTO observado: 4 segundos;
- pgvector restaurado: 0.8.5;
- 24 chunks activos y 0 sin embedding en la copia;
- rag-verify sobre la copia: 0 missing, stale, orphaned, dimensiones inválidas
  o fallas de autoconsistencia al momento del ensayo.

Rollout:

- empresa piloto 10000000-0000-0000-0000-000000000001 en HYBRID;
- get_properties, get_properties_by_id, get_leases y get_invoices retiradas de
  HYBRID de forma reversible;
- rollback real a TOOLS comprobado con HTTP 201.

Integración WhatsApp:

- el despliegue y las credenciales revisadas corresponden a Rent;
- la cuenta Meta usada para WhatsApp es Rent, no Agora;
- Graph API confirmó que el número configurado está aprobado.

Evaluación existente:

- 58 casos distribuidos entre admin, staff, owner y tenant, con una segunda
  empresa en la matriz de aislamiento;
- 58/58 aprobados por el runner estricto contra la copia aislada;
- 0 fuentes fuera de alcance, 0 fugas de entidad o contenido, 0 violaciones
  financieras y 0 respuestas incorrectas de alta confianza;
- precisión de fuentes, exactitud financiera/restringida, groundedness,
  abstención y estrategia: 100%;
- recall@K observado: 0,9691;
- p50 3480 ms y p95 10260 ms;
- 46.881 tokens de entrada y 17.400 de salida;
- costo estimado: USD 0,000301244 por consulta con las tarifas configuradas;
- el ensayo detectó y corrigió pérdida de milisegundos en
  source_updated_at, actualización omitida cuando el hash no cambiaba y falta
  de retry ante errores transitorios del endpoint de embeddings.

Validación de código:

- typecheck aprobado;
- build aprobado;
- 126 suites y 991 pruebas aprobadas entre backend y batch.

## 9. Estado real por fase

| Fase | Estado | Observación |
|---|---|---|
| A. Infraestructura | Implementada en producción | PostgreSQL 17.9, pgvector 0.8.5, HNSW y escaneo de imagen comprobados |
| B. Esquema | Implementada | Tablas e índices operativos |
| C. Batch | Implementada y verificada en producción | Dos backfills idempotentes, verificación completa y recall exacto/HNSW aprobados |
| D. Online | Implementada en código | Tombstone transaccional y revalidación sincrónica de existencia y versión |
| E. Backend RAG | Implementada en código | SQL registrado, autorización, métricas, límites, final-K y citas |
| F. Evaluación y rollout | Piloto aprobado | Gate aislado 58/58; falta tráfico shadow estable antes del rollout global |

No usar AI_RAG_ENABLED_COMPANY_IDS=* mientras existan brechas del plan de
cierre.

## 10. Brechas conocidas

1. Producción tiene backfill y `rag-verify` aprobados; falta repetir la
   evidencia en cualquier otro ambiente que se despliegue.
2. Falta medir el SLA p95 de frescura bajo carga en un ambiente aislado.
3. Falta importar/probar dashboards y disparar las alertas en el stack real;
   Oracle no expone actualmente Prometheus, Pushgateway ni Grafana locales.
4. El dataset declara entidades esperadas para todos los casos semánticos e
   híbridos no abstencionistas y valida valores restringidos contra SQL; debe
   mantenerse al agregar nuevas proyecciones.
5. Shadow no registró comparaciones en los últimos siete días y todavía no
   demuestra paridad con tools.
6. La E2E automatizada cubre fuente eliminada/stale, prompt injection
   almacenado, SQL injection, secretos, datos solapados y dos empresas; falta
   extenderla a toda nueva proyección que se incorpore.
7. Falta recalibrar los umbrales por rol y proyección con el corpus completo.
8. Falta la prueba de carga y un ciclo estable de piloto antes del rollout
   global. El ensayo de restauración quedó aprobado.

## 11. Plan para llegar a una implementación completa

### Etapa G — Completar las proyecciones

- [x] Crear builders canónicos para contratos, facturas/pagos, portfolios,
  cuentas de tenant, interesados y actividades.
- [x] Compartir builders entre backfill y sincronización online.
- [x] Agregar triggers/outbox para todas las dependencias que cambien el
  documento canónico.
- [x] Ejecutar backfill, verificación e HNSW con el corpus completo en
  producción.
- [x] Documentar campos incluidos y campos sensibles excluidos por proyección.

Criterio de aceptación:

- cobertura de fuentes operativas definida en 100%;
- dos backfills consecutivos generan 0 embeddings innecesarios;
- rag-verify informa 0 missing, stale, orphaned e invalid dimensions.

### Etapa H — Garantizar frescura y eliminación

- [x] Revalidar cada fuente vectorial contra la tabla operativa antes de
  incorporarla a la evidencia.
- [x] Comparar source_updated_at con updated_at de la entidad real.
- [x] Excluir eliminaciones dentro de la transacción o mediante validación
  sincrónica del retriever.
- [x] Probar builders de cada proyección y triggers/frescura contra PostgreSQL
  aislado; queda incorporar la matriz completa como E2E permanente.
- [ ] Medir p95 y máximo del lag bajo carga.

Criterio de aceptación:

- una entidad eliminada nunca aparece después del commit;
- una versión stale nunca llega al generador;
- p95 de frescura menor a 60 segundos.

### Etapa I — Consultas estructuradas y mutaciones seguras

- [x] Implementar consultas registradas para saldo de tenant, facturas, pagos,
  contratos, portfolio, disponibilidad y dashboard.
- [x] Validar valores monetarios exactos contra las filas SQL citadas en el
  runner; estados y fechas continúan proviniendo sólo del registro SQL.
- [x] Introducir preview y confirmación obligatoria para toda tool mutable.
- [x] Persistir quién confirmó, qué payload confirmó y el resultado.
- [x] Mantener servicios de dominio como única vía de escritura.

Criterio de aceptación:

- 0 mutaciones ejecutables sin confirmación;
- 100% de casos financieros coincide con valores SQL esperados;
- ninguna consulta usa text-to-SQL abierto.

### Etapa J — Observabilidad, alertas y retención

- [x] Publicar ai_rag_requests_total y duración por estrategia.
- [x] Publicar chunks recuperados, abstenciones, fallos de citas y rechazos de
  alcance.
- [ ] Crear dashboards para latencia, costo, calidad, outbox y frescura.
- [ ] Activar y probar alertas con fallos controlados.
- [x] Definir retención y purga para ai_rag_runs, shadow comparisons,
  confirmaciones y outbox procesado.
- [x] Registrar intentos de prompt override sin guardar contenido sensible.

Criterio de aceptación:

- todas las métricas del contrato aparecen en Prometheus;
- cada alerta fue disparada y recuperada en una prueba;
- la retención se ejecuta de forma idempotente.

### Etapa K — Evaluación rigurosa y seguridad E2E

- [x] Ampliar el dataset con entidades, valores y fuentes exactas para los 58
  casos actuales.
- [x] Agregar dos empresas, owners y tenants con datos solapados a la matriz
  E2E.
- [x] Comparar búsqueda exacta contra HNSW y medir recall@K real.
- [x] Verificar groundedness por claim, no sólo presencia de fuentes.
- [x] Probar prompt injection almacenado, SQL injection, fuentes stale,
  eliminadas y aislamiento de secretos/empresas en el corpus actual.
- [ ] Ejecutar suficiente tráfico shadow para comparar calidad, latencia y
  costo contra tools.
- [x] Permitir umbrales por rol y tipo de proyección; falta ejecutar la
  recalibración con el corpus completo.

Criterio de aceptación:

- 0 fugas cross-company, owner o tenant;
- 0 claims financieros incorrectos o sin fuente estructurada;
- 0 respuestas incorrectas con alta confianza;
- calidad igual o superior a tools con una muestra estadísticamente útil.

### Etapa L — Hardening y cierre de producción

- [x] Agregar escaneo de la imagen PostgreSQL al CI.
- [x] Fijar versiones, checksum y dimensiones en código; falta verificar todos
  los ambientes desplegados.
- [x] Probar restauración del backup actual en una base aislada y ejecutar
  `rag-verify` sobre la copia.
- [x] Probar rollback TOOLS y recuperación RAG en un ensayo documentado.
- [x] Configurar límite de salida, contexto máximo y final-K/reranking.
- [ ] Ejecutar pruebas de carga y definir capacidad.
- [ ] Mantener el piloto durante un ciclo estable antes del rollout global.
- [ ] Habilitar empresas progresivamente; usar * sólo al finalizar.

Criterio final:

1. todas las etapas G-L aprobadas;
2. todos los ambientes tienen pgvector versionado y monitoreado;
3. corpus completo indexado y verificado;
4. autorización y frescura comprobadas antes de generar;
5. toda afirmación factual está citada;
6. toda mutación requiere confirmación;
7. métricas, alertas, retención, backup y rollback están probados;
8. pruebas E2E no presentan fugas ni errores financieros;
9. RAG demuestra calidad igual o superior al chat actual;
10. el rollout global cuenta con una reversión inmediata a TOOLS.
