# RAG production readiness

Este runbook produce evidencia para los criterios operativos de
`rag_plan.md`. Ningún paso se considera aprobado sólo por disponer del script:
se debe conservar la salida, fecha, ambiente, versión desplegada y responsable.

## 1. Migración y corpus

Aplicar migraciones y comprobar el corpus:

```bash
./migrations/run-migrations.sh
cd batch
node dist/index.js rag-backfill --entity all --batch-size 50 --concurrency 2
node dist/index.js rag-backfill --entity all --batch-size 50 --concurrency 2
node dist/index.js rag-verify --entity all --sample-size 1000
node dist/index.js rag-build-index
node dist/index.js rag-recall --sample-size 100 --k 8 --min-recall 0.95
```

El segundo backfill debe informar cero embeddings innecesarios. `rag-verify`
debe informar cero faltantes, stale, huérfanos y dimensiones inválidas.

## 2. Frescura y carga

La prueba de frescura modifica y restaura una propiedad. Sólo debe ejecutarse
en un ambiente aislado con el worker online:

```bash
cd batch
RAG_BENCHMARK_CONFIRM=isolated-environment \
node scripts/rag-freshness-benchmark.js \
  --property-id "$AI_RAG_LOAD_PROPERTY_ID" \
  --samples 100 \
  --sla-ms 60000 \
  > /tmp/rag-freshness.json
```

Ejecutar en paralelo la carga de lecturas:

```bash
cd backend
AI_EVAL_BASE_URL=https://staging.example.com \
AI_LOAD_JWT="$AI_LOAD_JWT" \
RAG_LOAD_RATE=10 \
RAG_LOAD_DURATION=15m \
k6 run evals/rag-load.k6.js
```

Se aprueba con menos de 1% de errores, p95 de respuesta menor a 8 segundos y
p95 de frescura menor a 60 segundos.

## 3. Evaluación y shadow

```bash
cd backend
npm run rag:eval -- --strict --report /tmp/rag-eval.json
npm run rag:eval -- --category adversarial --strict
npm run rag:shadow-report -- --hours 168 > /tmp/rag-shadow-week.json
```

Conservar cantidad de comparaciones, paridad, p50/p95, costo, fugas y
abstenciones. No promover con fugas, claims financieros incorrectos o una
muestra shadow insuficiente para el tráfico del ambiente.

## 4. Métricas, dashboard y alertas

- Importar `observability/grafana/dashboards/rag-overview.json`.
- Cargar `observability/prometheus/rag-alerts.yml`.
- Confirmar que `/metrics` y Pushgateway exponen todas las series usadas.
- Disparar cada alerta en staging con un umbral temporal controlado.
- Conservar captura del estado `firing` y de su recuperación.

La purga debe estar programada semanalmente:

```bash
node batch/dist/index.js rag-purge-audit --dry-run
node batch/dist/index.js rag-purge-audit
```

## 5. Restauración

El destino está protegido por el sufijo obligatorio `_restore_drill`:

```bash
POSTGRES_HOST=localhost \
POSTGRES_USER=rent_user \
POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
./scripts/rag-restore-drill.sh \
  backups/rent.dump \
  rent_2026q3_restore_drill
```

Después ejecutar `rag-verify` contra la base restaurada y registrar RTO,
integridad, versión de pgvector y cantidad de chunks sin embedding.

## 6. Rollback y recuperación

1. Establecer `AI_RETRIEVAL_MODE=RAG_READ` o `HYBRID`, reiniciar y verificar:

   ```bash
   ./scripts/verify-rag-rollout-mode.sh "$BASE_URL" "$JWT" HYBRID
   ```

2. Establecer `AI_RETRIEVAL_MODE=TOOLS`, reiniciar y verificar:

   ```bash
   ./scripts/verify-rag-rollout-mode.sh "$BASE_URL" "$JWT" TOOLS
   ```

3. Restaurar el modo RAG anterior, reiniciar y verificar nuevamente.
4. Confirmar que tablas, auditoría, chunks, outbox y catálogo de tools no
   sufrieron pérdida.

## 7. Promoción

Promover por empresa: `RAG_SHADOW`, `RAG_READ`, `HYBRID`. Mantener una ventana
estable acordada, revisar alertas y evaluación, y recién entonces sumar la
siguiente empresa. `AI_RAG_ENABLED_COMPANY_IDS=*` queda prohibido hasta que
todas las evidencias anteriores estén aprobadas en cada ambiente.
