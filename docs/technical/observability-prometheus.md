# Observabilidad con Prometheus

## Backend

- Scrape: `GET /metrics`
- Métricas clave:
  - `http_requests_total`
  - `http_request_duration_seconds`
  - `http_requests_in_flight`
  - `frontend_web_vital_value`
  - `frontend_client_errors_total`
  - `frontend_api_failures_total`

## Batch

- Publicación por Pushgateway (`PROMETHEUS_PUSHGATEWAY_URL`)
- Métricas clave:
  - `batch_job_runs_total`
  - `batch_job_duration_seconds`
  - `batch_records_total`
  - `batch_records_processed_total`
  - `batch_records_failed_total`
  - `batch_last_success_timestamp_seconds`

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
