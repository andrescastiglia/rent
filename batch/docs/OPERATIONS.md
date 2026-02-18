# Billing Batch - Documentación de Operación

## Instalación

```bash
cd batch
npm install
npm run build
```

## Configuración

### Variables de Entorno

Crear archivo `.env` en la raíz del proyecto:

```bash
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=rent_user
DATABASE_PASSWORD=secret
DATABASE_NAME=rent_db

# APIs Externas
BCRA_API_URL=https://api.bcra.gob.ar
BCRA_ICL_VARIABLE_ID=40
# BCRA_API_INSECURE=true   # opcional solo si el entorno no valida el certificado TLS
DATOS_AR_API_URL=https://apis.datos.gob.ar/series/api/series
DATOS_AR_IPC_SERIES_ID=148.3_INIVELNAL_DICI_M_26

# WhatsApp (vía backend)
PORT=3001
BATCH_WHATSAPP_INTERNAL_TOKEN=replace_with_shared_secret

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
| `sync-indices` | Sincronizar índices `icl` (BCRA) e `ipc` (datos.gob.ar) |
| `sync-rates` | Sincronizar tipos de cambio `USD/ARS`, `BRL/ARS`, `USD/BRL` |
| `reports` | Generar reportes PDF (`monthly` o `settlement`) por propietario |
| `process-settlements` | Calcular/procesar liquidaciones de propietarios |

Notas operativas:
- La opción `late-fees` fue eliminada del CLI batch.
- `reminders` usa WhatsApp a través del endpoint interno del backend.
- `sync-indices` sincroniza `ipc` diariamente y persiste un registro por mes (`period_date`) para evitar duplicados.
- `sync-indices` sincroniza `icl` diariamente y persiste solo el último valor disponible de cada mes.
- `igp_m` (Brasil) está deshabilitado para sincronización en batch.
- En facturación, `icl` toma el valor del mes anterior al mes facturado; si falta, usa el mes previo disponible.
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

Editar crontab con `crontab -e`:

```cron
# Billing Batch Jobs
# ===================

# Sincronizar índices de inflación (diario 6:00 AM)
0 6 * * * cd /opt/rent/batch && npm run start -- sync-indices --log /var/log/batch/sync-indices.log

# Sincronizar tipos de cambio (diario 6:30 AM)
30 6 * * * cd /opt/rent/batch && npm run start -- sync-rates --log /var/log/batch/sync-rates.log

# Generar facturas (diario 7:00 AM)
0 7 * * * cd /opt/rent/batch && npm run start -- billing --log /var/log/batch/billing.log

# Marcar facturas vencidas (diario 8:00 AM)
0 8 * * * cd /opt/rent/batch && npm run start -- overdue --log /var/log/batch/overdue.log

# Enviar recordatorios por WhatsApp (diario 9:00 AM)
0 9 * * * cd /opt/rent/batch && npm run start -- reminders --log /var/log/batch/reminders.log

# Generar reportes mensuales (día 1 de cada mes, 10:00 AM)
0 10 1 * * cd /opt/rent/batch && /opt/rent/batch/scripts/generate-all-reports.sh --log /var/log/batch/reports.log

# Calcular liquidaciones (día 2 de cada mes, 07:00 AM)
0 7 2 * * cd /opt/rent/batch && npm run start -- process-settlements --log /var/log/batch/process-settlements.log
```

---

## Monitoreo

### Logs

Los logs se almacenan en `./logs/` con rotación diaria:
- `batch-YYYY-MM-DD.log` - Logs de aplicación
- `error-YYYY-MM-DD.log` - Solo errores

### Healthcheck

```bash
# Verificar conectividad
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

### Error: Puppeteer no genera PDF
```bash
# Instalar dependencias de Chrome
sudo apt-get install -y chromium-browser
```
