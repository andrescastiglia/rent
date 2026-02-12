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
BCB_API_URL=https://api.bcb.gov.br

# Notificaciones por email (reminders)
SENDGRID_API_KEY=SG.xxx
EMAIL_FROM=noreply@example.com
EMAIL_FROM_NAME="Sistema de Alquileres"

# Reportes
REPORTS_OUTPUT_DIR=./reports

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
| `reminders` | Enviar recordatorios por email (SendGrid) |
| `sync-indices` | Sincronizar índices `icl` (BCRA) e `igpm` (BCB) |
| `sync-rates` | Sincronizar tipos de cambio `USD/ARS`, `BRL/ARS`, `USD/BRL` |
| `reports` | Generar reportes PDF (`monthly` o `settlement`) por propietario |
| `process-settlements` | Calcular/procesar liquidaciones de propietarios |

Notas operativas:
- La opción `late-fees` fue eliminada del CLI batch.
- `reminders` actualmente usa email. No hay envío por WhatsApp en batch.
- `sync-indices` no sincroniza `ipc` ni `casa_propia` en esta implementación.
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

# Recordatorios por email 5 días antes
npm run start -- reminders --days-before 5

# Sincronizar solo ICL
npm run start -- sync-indices --index icl

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

# Enviar recordatorios por email (diario 9:00 AM)
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

### Alertas Recomendadas

| Condición | Acción |
|-----------|--------|
| Billing falla | Notificar admin |
| >10 facturas fallidas | Revisar manualmente |
| Servicio de email caído | Reintentar en 30min |
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

### Error: SendGrid quota exceeded
```bash
# Verificar uso de API
# Dashboard: https://app.sendgrid.com
```

### Error: Puppeteer no genera PDF
```bash
# Instalar dependencias de Chrome
sudo apt-get install -y chromium-browser
```
