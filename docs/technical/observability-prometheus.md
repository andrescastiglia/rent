# Observabilidad con Prometheus

Los SLO, responsables, respuesta y recuperación operativa están definidos en
[`docs/deployment/operations-slo.md`](../deployment/operations-slo.md). Las
reglas validadas por CI viven en `observability/prometheus/`; el bloque de abajo
se conserva como ejemplos de consultas complementarias.

## Health checks y tracing en New Relic

Backend y frontend excluyen `/health` y `/health/live` del tracing, también
cuando responden con error. Se admiten barra final y query string; rutas como
`/healthcheck` o `/health/otra` siguen instrumentadas. Los handlers, respuestas,
probes de Kubernetes y métricas independientes del tracing mantienen su comportamiento.

El backend OTLP usa `ignoreIncomingRequestHook` en la instrumentación HTTP para
suprimir el contexto completo, incluida la consulta a PostgreSQL. El agente
nativo del backend y el agente híbrido de Next.js usan `rules.ignore` en sus
respectivos `newrelic.js`, preservando la exclusión predeterminada de Socket.IO.
Esto descarta las transacciones de las probes y sus spans hijos, incluida la
llamada de readiness del frontend al backend. No se aplica un filtro global a
consultas SQL ni a llamadas HTTP de las rutas de negocio.

Después de desplegar una release y renovar los procesos de backend y frontend:

1. Comprobar `/health` y `/health/live` en ambos servicios. Readiness conserva
   su dependencia del backend/base de datos; liveness sigue independiente.
2. Generar varias peticiones a esas rutas y a una ruta de negocio. Validar los
   fallos de readiness en un entorno de prueba, sin interrumpir la base productiva.
3. Esperar la ingesta y consultar `Span` y, para el agente nativo, `Transaction`
   en New Relic, acotando por servicio y por una ventana posterior al despliegue.
   Comprobar que no haya eventos de health ni spans hijos de esas peticiones,
   y que sí haya trazas de la ruta de negocio. Las trazas históricas no se borran.

Si se configura `NEW_RELIC_IGNORING_RULES` en el entorno, debe incluir estas
exclusiones: la variable reemplaza las reglas del archivo. Una reversión utiliza
la release anterior; no requiere cambios en las probes ni en la base de datos.

## Backend

- Scrape: `GET /metrics`
- Métricas clave:
  - `http_requests_total`
  - `http_request_duration_seconds`
  - `http_requests_in_flight`
  - `frontend_web_vital_value`
  - `frontend_client_errors_total`
  - `frontend_api_failures_total`
  - `ai_rag_requests_total`
  - `ai_rag_request_duration_seconds`
  - `ai_rag_retrieved_chunks`
  - `ai_rag_abstentions_total`
  - `ai_rag_citation_failures_total`
  - `ai_rag_scope_rejections_total`
  - `ai_rag_prompt_override_attempts_total`
  - `ai_rag_tokens_total`
  - `ai_rag_estimated_cost_usd_total`

## Batch

- Publicación por Pushgateway (`PROMETHEUS_PUSHGATEWAY_URL`)
- Métricas clave:
  - `batch_job_runs_total`
  - `batch_job_duration_seconds`
  - `batch_records_total`
  - `batch_records_processed_total`
  - `batch_records_failed_total`
  - `batch_last_success_timestamp_seconds`
  - `ai_embedding_requests_total`
  - `ai_embedding_tokens_total`
  - `ai_embedding_request_duration_seconds`
  - `ai_embedding_backfill_records_total`
  - `ai_embedding_outbox_pending`
  - `ai_embedding_outbox_failed`
  - `ai_embedding_lag_seconds`

## Reglas de alerta sugeridas

```yaml
groups:
  - name: rent-api
    rules:
      - alert: ApiHighP95Latency
        expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)) > 1.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Latencia p95 alta en API"

      - alert: ApiHigh5xxRate
        expr: sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Tasa de errores 5xx superior a 5%"

      - alert: RagBackendHighP95Latency
        expr: histogram_quantile(0.95, sum(rate(ai_rag_request_duration_seconds_bucket[10m])) by (le, strategy)) > 8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Latencia p95 alta en RAG"

      - alert: RagCitationFailures
        expr: increase(ai_rag_citation_failures_total[15m]) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "El verificador rechazó claims con citas inválidas"

      - alert: RagScopeRejectionsSpike
        expr: increase(ai_rag_scope_rejections_total{reason="authorization"}[10m]) > 5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Aumento de fuentes rechazadas por autorización"

      - alert: RagAbstentionRateHigh
        expr: sum(rate(ai_rag_abstentions_total[15m])) / clamp_min(sum(rate(ai_rag_requests_total{outcome="success"}[15m])), 0.001) > 0.35
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "La tasa de abstención RAG supera 35%"

  - name: rent-batch
    rules:
      - alert: BatchNoRecentSuccess
        expr: time() - max(batch_last_success_timestamp_seconds{job="billing"}) > 90000
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "billing no registra ejecuciones exitosas recientes"

      - alert: BatchFailuresDetected
        expr: increase(batch_job_runs_total{status="failed"}[1h]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Se detectaron ejecuciones batch fallidas"

      - alert: RagOutboxFreshnessSlaExceeded
        expr: max(ai_embedding_lag_seconds) > 60
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "El outbox RAG supera el SLA de frescura de 60 segundos"

      - alert: RagOutboxFailedEvents
        expr: sum(ai_embedding_outbox_failed) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Hay eventos RAG en estado failed"

      - alert: RagReconciliationMissing
        expr: time() - max(batch_last_success_timestamp_seconds{job="rag-reconcile"}) > 90000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "La reconciliación nocturna RAG no registra un éxito reciente"

  - name: rent-frontend
    rules:
      - alert: FrontendLCPDegraded
        expr: histogram_quantile(0.75, sum(rate(frontend_web_vital_value_bucket{metric_name="LCP"}[15m])) by (le)) > 2.5
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "LCP p75 degradado"

      - alert: FrontendINPDegraded
        expr: histogram_quantile(0.75, sum(rate(frontend_web_vital_value_bucket{metric_name="INP"}[15m])) by (le)) > 0.2
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "INP p75 degradado"
```
