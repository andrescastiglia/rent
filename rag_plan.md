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
- document_chunk.

Proyecciones todavía necesarias para completar el alcance:

- lease_summary;
- invoice_payment_summary;
- owner_portfolio_summary;
- tenant_account_summary;
- interested_profile_summary;
- activity_chunk;
- ventas, mantenimiento y otras entidades que se definan como recuperables.

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
AI_RAG_STRUCTURED_LIMIT=20
AI_RAG_TIMEOUT_MS=60000

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
~~~

Evaluación:

~~~bash
npm run rag:eval -- --report /tmp/rag-eval.json --strict
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

- PostgreSQL 16 con PostGIS 3.5.3 y pgvector 0.8.5;
- índice HNSW activo;
- backend y rent-rag-worker online;
- reconciliación nocturna configurada;
- Pushgateway configurado;
- backup previo a Fase F verificado.

Datos actuales:

- 7 property_summary;
- 2 document_chunk;
- 9 de 9 chunks con embedding;
- 0 chunks sin embedding;
- 0 chunks stale;
- outbox sin pendientes ni fallidos al verificar;
- frescura histórica máxima observada: 31,896 segundos.

Rollout:

- empresa piloto 10000000-0000-0000-0000-000000000001 en HYBRID;
- get_properties, get_properties_by_id, get_leases y get_invoices retiradas de
  HYBRID de forma reversible;
- rollback real a TOOLS comprobado con HTTP 201.

Evaluación existente:

- 50 casos por admin, staff, owner y tenant;
- 50/50 aprobados por el runner actual;
- 0 fuentes fuera de alcance;
- p50 2512 ms y p95 6378 ms;
- 34.174 tokens de entrada y 9.777 de salida;
- costo estimado: USD 0,000219846 por consulta con las tarifas configuradas.

Validación de código:

- typecheck aprobado;
- build aprobado;
- 105 suites y 796 pruebas aprobadas.

## 9. Estado real por fase

| Fase | Estado | Observación |
|---|---|---|
| A. Infraestructura | Parcial avanzada | Falta demostrar escaneo de imagen en CI y todos los ambientes |
| B. Esquema | Implementada | Tablas e índices operativos |
| C. Batch | Parcial | Sólo propiedades y documentos |
| D. Online | Parcial avanzada | Cumple SLA observado; falta exclusión inmediata garantizada |
| E. Backend RAG | Parcial avanzada | Funciona para el alcance actual; faltan métricas y cobertura total |
| F. Evaluación y rollout | Piloto aprobado | El dataset debe fortalecerse antes de rollout global |

No usar AI_RAG_ENABLED_COMPANY_IDS=* mientras existan brechas del plan de
cierre.

## 10. Brechas conocidas

1. Sólo 2 de las 8 proyecciones iniciales están implementadas.
2. Admin y staff pueden depender del worker para excluir una fuente eliminada.
3. No existe confirmación universal para todas las tools mutables.
4. El backend no publica todas las métricas ai_rag_* definidas.
5. No existe una política automática de retención para ai_rag_runs.
6. La generación no configura todavía límite explícito de salida ni una
   estrategia de reranking/final-K.
7. El dataset sólo declara entidades esperadas en una fracción de los casos.
8. La exactitud financiera actual valida el tipo de fuente, no el valor exacto.
9. Shadow tiene pocas comparaciones exitosas para demostrar paridad con tools.
10. Faltan pruebas E2E de fuente eliminada/stale, prompt injection almacenado,
    secretos, dos empresas y comparación exacta contra HNSW.
11. Falta escaneo automatizado de la imagen PostgreSQL en CI.
12. Falta recalibrar el umbral con un dataset más completo.

## 11. Plan para llegar a una implementación completa

### Etapa G — Completar las proyecciones

- [ ] Crear builders canónicos para contratos, facturas/pagos, portfolios,
  cuentas de tenant, interesados y actividades.
- [ ] Compartir builders entre backfill y sincronización online.
- [ ] Agregar triggers/outbox para todas las dependencias que cambien el
  documento canónico.
- [ ] Ejecutar backfill, verificación e HNSW con el corpus completo.
- [ ] Documentar campos incluidos y campos sensibles excluidos por proyección.

Criterio de aceptación:

- cobertura de fuentes operativas definida en 100%;
- dos backfills consecutivos generan 0 embeddings innecesarios;
- rag-verify informa 0 missing, stale, orphaned e invalid dimensions.

### Etapa H — Garantizar frescura y eliminación

- [ ] Revalidar cada fuente vectorial contra la tabla operativa antes de
  incorporarla a la evidencia.
- [ ] Comparar source_updated_at con updated_at de la entidad real.
- [ ] Excluir eliminaciones dentro de la transacción o mediante validación
  sincrónica del retriever.
- [ ] Probar create, update y delete para cada proyección.
- [ ] Medir p95 y máximo del lag bajo carga.

Criterio de aceptación:

- una entidad eliminada nunca aparece después del commit;
- una versión stale nunca llega al generador;
- p95 de frescura menor a 60 segundos.

### Etapa I — Consultas estructuradas y mutaciones seguras

- [ ] Implementar consultas registradas para saldo de tenant, facturas, pagos,
  contratos, portfolio, disponibilidad y dashboard.
- [ ] Validar valores exactos de montos, monedas, estados y fechas.
- [ ] Introducir preview y confirmación obligatoria para toda tool mutable.
- [ ] Persistir quién confirmó, qué payload confirmó y el resultado.
- [ ] Mantener servicios de dominio como única vía de escritura.

Criterio de aceptación:

- 0 mutaciones ejecutables sin confirmación;
- 100% de casos financieros coincide con valores SQL esperados;
- ninguna consulta usa text-to-SQL abierto.

### Etapa J — Observabilidad, alertas y retención

- [ ] Publicar ai_rag_requests_total y duración por estrategia.
- [ ] Publicar chunks recuperados, abstenciones, fallos de citas y rechazos de
  alcance.
- [ ] Crear dashboards para latencia, costo, calidad, outbox y frescura.
- [ ] Activar y probar alertas con fallos controlados.
- [ ] Definir retención y purga para ai_rag_runs y shadow comparisons.
- [ ] Registrar intentos de prompt override sin guardar contenido sensible.

Criterio de aceptación:

- todas las métricas del contrato aparecen en Prometheus;
- cada alerta fue disparada y recuperada en una prueba;
- la retención se ejecuta de forma idempotente.

### Etapa K — Evaluación rigurosa y seguridad E2E

- [ ] Ampliar el dataset con entidades, valores y fuentes exactas en todos los
  casos.
- [ ] Agregar múltiples empresas, owners y tenants con datos solapados.
- [ ] Comparar búsqueda exacta contra HNSW y medir recall@K real.
- [ ] Verificar groundedness por claim, no sólo presencia de fuentes.
- [ ] Probar prompt injection almacenado, SQL injection, fuentes stale,
  eliminadas y datos sensibles.
- [ ] Ejecutar suficiente tráfico shadow para comparar calidad, latencia y
  costo contra tools.
- [ ] Recalibrar AI_RAG_MIN_SIMILARITY por rol y tipo de proyección.

Criterio de aceptación:

- 0 fugas cross-company, owner o tenant;
- 0 claims financieros incorrectos o sin fuente estructurada;
- 0 respuestas incorrectas con alta confianza;
- calidad igual o superior a tools con una muestra estadísticamente útil.

### Etapa L — Hardening y cierre de producción

- [ ] Agregar escaneo de la imagen PostgreSQL al CI.
- [ ] Fijar y verificar versiones, checksums y dimensiones en cada ambiente.
- [ ] Probar restauración del backup en una base aislada.
- [ ] Probar rollback TOOLS y recuperación RAG en un ensayo documentado.
- [ ] Configurar límite de salida, contexto máximo y final-K/reranking.
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
