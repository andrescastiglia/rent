# Billing Batch - Documentación de Operación

## Instalación

```bash
cd batch
npm install
npm run build
```

## Configuración

### Variables de Entorno

En ejecución nativa, crear `batch/.env`; el CLI carga el archivo desde su directorio de trabajo. Kubernetes monta el runtime protegido y no usa ese archivo. Ver [despliegue vigente](../../docs/deployment/kubernetes.md).

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=rent_user
POSTGRES_PASSWORD=secret
POSTGRES_DB=rent_db

# APIs Externas
BCRA_API_URL=https://api.bcra.gob.ar
BCRA_ICL_VARIABLE_ID=40
BCRA_EXCHANGE_RATE_API_URL=https://api.bcra.gob.ar/estadisticascambiarias/v1.0
BCB_API_URL=https://api.bcb.gov.br/dados/serie
DATOS_AR_API_URL=https://apis.datos.gob.ar/series/api/series
DATOS_AR_IPC_SERIES_ID=148.3_INIVELNAL_DICI_M_26

# WhatsApp (vía backend)
BACKEND_INTERNAL_URL=http://localhost:3001
BATCH_WHATSAPP_INTERNAL_TOKEN=replace_with_shared_secret
BATCH_BILLING_INTERNAL_TOKEN=replace_with_shared_secret
BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN=replace_with_shared_secret
# Los tokens deben coincidir con los del backend.

# Logs
LOG_LEVEL=info
LOG_DIR=./logs
```

---

## Comandos Disponibles

| Comando | Descripción |
|---------|-------------|
| `billing` | Generar facturas del día |
| `overdue` | Marcar facturas vencidas |
| `reminders` | Enviar recordatorios por WhatsApp |
| `sync-indices` | Ingerir observaciones versionadas `icl`, `ipc` e `igp_m` |
| `sync-rates` | Sincronizar tipos de cambio `USD/ARS`, `BRL/ARS`, `USD/BRL` |
| `reports` | Generar reportes PDF (`monthly` o `settlement`) por propietario |
| `process-settlements` | Preview legado con `--dry-run`; escrituras retiradas |
| `lease-renewal-alerts` | Crear actividades y avisos de renovación |
| `reconcile-bank` | Conciliar movimientos mediante el backend; ejecución manual |
| `process-whatsapp-inbox` | Procesar mensajes entrantes; requiere entrada habilitada en backend |
| `apply-whatsapp-retention` | Aplicar retención de datos de WhatsApp |
| `rag-sync` | Worker continuo de la outbox RAG |
| `rag-reconcile` / `rag-purge-audit` | Reparación diaria y retención semanal RAG |

Notas operativas:
- La opción `late-fees` fue eliminada del CLI batch.
- `reminders` usa WhatsApp a través del endpoint interno del backend.
- `sync-indices` guarda ICL diario e IPC/IGP-M mensuales en `inflation_observations`, con revisiones inmutables, procedencia y recuperación de ventanas. El cron productivo permanece suspendido; no existe `--dry-run` para este comando.
- Los ajustes de facturación pertenecen al backend y exigen la cobertura exacta del índice y fechas del contrato; consultar [ajustes](../../docs/technical/rent-adjustments.md).
- `sync-rates --dry-run` consulta y valida proveedores sin guardar cotizaciones; registra la ejecución como preview. USD/ARS y BRL/ARS usan `/Cotizaciones/{moneda}` y `tipoCotizacion`, no IDs de series monetarias. USD/BRL conserva BCB SGS 1; una falla de DNS no se convierte en éxito ni reemplaza la fuente.
- `process-settlements` conserva sólo el cálculo legado de lectura. Generación, snapshots, comisiones, retenciones y pagos canónicos pertenecen al backend; no reactivar su cron como escritor.
- Los comandos administrativos RAG (`rag-backfill`, `rag-verify`, `rag-build-index`, `rag-purge-stale`, `rag-recall`) son manuales. Ver [RAG](RAG.md).
- `reports` requiere `--owner-id`.

### Ejemplos

```bash
# Ejecutar facturación
npm run start -- billing

# Modo dry-run (sin cambios)
npm run start -- billing --dry-run

# Facturación para fecha específica
npm run start -- billing --date 2025-12-01

# Marcar vencidas
npm run start -- overdue

# Recordatorios por WhatsApp 5 días antes
npm run start -- reminders --days-before 5

# Sincronizar solo ICL
npm run start -- sync-indices --index icl

# Sincronizar solo IPC
npm run start -- sync-indices --index ipc

# Sincronizar tipos de cambio
npm run start -- sync-rates

# Reporte mensual de un propietario
npm run start -- reports --type monthly --owner-id <OWNER_ID> --month 2026-01

# Reporte de liquidación de un propietario
npm run start -- reports --type settlement --owner-id <OWNER_ID> --month 2026-01

# Calcular liquidaciones sin persistir
npm run start -- process-settlements --dry-run
```

---

## Configuración de Crontab

Producción utiliza [los 15 CronJobs de Kubernetes](../../k8s/base/cronjobs.yaml), el overlay productivo y un Deployment `rag-worker`. Los horarios son **UTC**, tres horas por delante de Argentina. `billing`, `sync-indices` y `process-settlements` permanecen suspendidos.

El [crontab de ejemplo](../scripts/crontab.example) corresponde al despliegue nativo histórico; no instalarlo junto a Kubernetes. `reports` debe invocar `generate-all-reports.sh`: el comando individual exige `--owner-id`. El wrapper genera ambos tipos para todos los propietarios durante el mes anterior y admite `--dry-run`.

**Batch operations** permite ejecuciones manuales con la imagen desplegada y bloqueo de base compartido con el cron. La opción `reports` ejecuta el wrapper completo. `sync-indices` con `dry_run=true` se rechaza antes de crear el Job; usar una ingestión real únicamente con autorización operativa. `reconcile-bank` no tiene cron automático.

---

## Monitoreo

### Logs

En Kubernetes se usa stdout/stderr con `LOG_TO_FILE=false`; consultar `kubectl logs`. En ejecución nativa, revisar `LOG_DIR` y la configuración de `shared/logger.ts`; `--log` selecciona un archivo sin rotación.

### Healthcheck

```bash
# Verificar únicamente versión del CLI (no conectividad ni proveedores)
npm run start -- --version

# Verificar base de datos
npm run start -- billing --dry-run
```

### Prometheus (Pushgateway)

El batch es efímero, por lo que reporta métricas al finalizar cada comando:
- `batch_job_runs_total{job,status}`
- `batch_job_duration_seconds{job,status}`
- `batch_records_total{job}`
- `batch_records_processed_total{job}`
- `batch_records_failed_total{job}`
- `batch_last_success_timestamp_seconds{job}`

Variables:

```bash
PROMETHEUS_PUSHGATEWAY_URL=http://localhost:9091
PROMETHEUS_PUSHGATEWAY_JOB=rent_batch
# opcional
PROMETHEUS_PUSHGATEWAY_INSTANCE=batch-node-1
```

Si `PROMETHEUS_PUSHGATEWAY_URL` está vacío, la ejecución continúa sin push de métricas.

### Traces (OpenTelemetry)

El batch emite spans OTLP cuando `OTEL_EXPORTER_OTLP_ENDPOINT` o
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` está configurado.

Variables:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
# o endpoint específico:
# OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
OTEL_SERVICE_NAME=rent-batch
OTEL_ENVIRONMENT=production
```

### Profiling continuo (Pyroscope)

El batch inicia profiler si `PYROSCOPE_SERVER_ADDRESS` está configurado.

Variables:

```bash
PYROSCOPE_ENABLED=true
PYROSCOPE_SERVER_ADDRESS=http://localhost:4040
PYROSCOPE_APPLICATION_NAME=rent-batch
PYROSCOPE_AUTH_TOKEN=
PYROSCOPE_TENANT_ID=
PYROSCOPE_FLUSH_INTERVAL_MS=10000
PYROSCOPE_TAGS=team=platform,region=us-east-1
PYROSCOPE_ENV=production
```

### Alertas Recomendadas

| Condición | Acción |
|-----------|--------|
| Billing falla | Notificar admin |
| >10 facturas fallidas | Revisar manualmente |
| Servicio de WhatsApp caído | Reintentar en 30min |
| API BCRA no responde | Usar último valor cached |

---

## Troubleshooting

### Error: Database connection refused
```bash
# Verificar PostgreSQL
sudo systemctl status postgresql

# Verificar variables de entorno
env | grep DATABASE
```

### Error: WhatsApp API unavailable
```bash
# Verificar credenciales y conectividad con Graph API
# Endpoint: https://graph.facebook.com/v22.0/{phone-id}/messages
```

### Error de generación PDF

Los reportes usan PDFKit y guardan bytes en PostgreSQL; no requieren Chromium. Revisar inconsistencias contables, permisos de base, `file_data` y errores de `billing_jobs`.

### Error 404 o DNS al sincronizar cotizaciones

Verificar que `BCRA_EXCHANGE_RATE_API_URL` corresponda a Estadísticas Cambiarias y que la imagen use `/Cotizaciones/USD` y `/Cotizaciones/BRL`. No consultar `/Monetarias/12` como BRL/ARS. Si BCB devuelve `ENOTFOUND`, verificar resolución desde el host y el pod; conservar la falla hasta que el proveedor sea accesible. No publicar cotizaciones estimadas como datos oficiales.

## Garantías de reportes y recuperación (2026-10-01)

`reports --owner-id` acepta exclusivamente `owners.id`, no un ID de usuario. El wrapper `scripts/generate-all-reports.sh` enumera propietarios vigentes de todas las compañías, incluidos los que no tienen acceso al portal. Calcula el mes anterior desde el día 1 en horario de Argentina, continúa con otros reportes cuando uno falla y termina con código 1 si hubo cualquier error.

El resumen mensual lee facturas, imputaciones activas y notas de crédito de la compañía del propietario en una transacción de lectura con snapshot consistente. Los cobros parciales reducen el saldo; las monedas se presentan y totalizan por separado. Una factura cuyo `paid_amount` no coincide con sus imputaciones válidas falla y requiere conciliación.

El informe de liquidación usa **liquidaciones ya registradas**, su comisión, retenciones, neto y snapshot de origen. No calcula una comisión fija ni genera una transferencia. Cuando falta detalle de origen histórico, lo indica expresamente; una inconsistencia entre bruto, deducciones y neto bloquea el reporte. `--dry-run` renderiza en memoria sin guardar un documento.

Los fallos parciales quedan como `partial_failure` en `billing_jobs`, producen código de salida 1 y métricas de fallo; no actualizan el timestamp del último éxito. Corregir el registro afectado y reintentar únicamente el propietario/período o caso fallido. Los PDF se guardan junto con su URL final en una única sentencia.

Para conciliación manual: `node dist/index.js reconcile-bank --company-id <uuid> --limit 25 --min-age-minutes 10`; antes de ejecutar cambios puede usarse `--dry-run`. Revisar el resultado persistido y las alertas del backend. Para supervisar colas, consultar métricas de pendientes/fallos/edad y los registros fallidos antes de reintentar; los estados inciertos de proveedores exigen conciliación.

Se conserva la suspensión de los cronjobs `billing`, `sync-indices` y `process-settlements`. BFA, Mercado Libre y Mercado Pago Payouts permanecen deshabilitados. Un reporte no habilita ninguno de esos proveedores.
