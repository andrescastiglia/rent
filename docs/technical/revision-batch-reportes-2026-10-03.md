# Revisión de batch y reportes

Corte: 3 de octubre de 2026, Argentina. Se revisaron código, pruebas, requisitos vigentes, manifiestos y estado real de `oracle`, mediante consultas de lectura. **La cobertura operativa no está completa y existe una falla real de cotizaciones.** Las correcciones de esta revisión quedan locales; no se publicaron ni se reactivaron procesos.

## Alerta de New Relic

La [alerta consultada](https://one.newrelic.com/alerts/issue?account=8213841&duration=259200000&state=1749a0f4-92f6-cf70-c362-76958d5b8a9a) corresponde a `Rent — failed scheduled or manual task`, condición 67721653, política `Rent Kubernetes production`. Se abrió el 3 de octubre a las 03:35 de Argentina.

El Job `sync-rates-29850150` corrió a las 03:30, terminó con código 1 y registró `partial_failure`, con tres errores: 404 en USD/ARS y BRL/ARS y `ENOTFOUND api.bcb.gov.br` en USD/BRL. El monitor consulta `latest(rent.platform.failed_jobs)` y contó ese Job fallido. No es una caída general de la aplicación.

El runtime configura Estadísticas Cambiarias, pero el cliente usaba rutas de series monetarias y un fallback incompatible con esa base. Se corrigió a `/Cotizaciones/USD` y `/Cotizaciones/BRL`, leyendo `tipoCotizacion` y la fecha del grupo, con validación de moneda, valores, fechas y cobertura de respuesta. Se conserva BCB SGS 1 para USD/BRL: su falla de DNS sigue pendiente; no se reemplazó silenciosamente por otra cotización.

Las consultas de lectura a la [API oficial USD](https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD?fechaDesde=2026-09-28&fechaHasta=2026-10-02&limit=1000) y [BRL](https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/BRL?fechaDesde=2026-09-28&fechaHasta=2026-10-02&limit=1000) devolvieron HTTP 200 y cinco fechas cada una. El cliente compilado corregido también validó las diez observaciones en `syncRates(true)`, con cero inserciones y una protección que rechaza cualquier escritura inesperada. El BCB no resolvió desde el entorno de revisión, al igual que en el pod productivo.

**Antes de publicar:** las filas históricas de fuente `BCRA` requieren revisar su procedencia: los IDs monetarios antiguos no son equivalentes a las cotizaciones cambiarias. La corrección no acredita ni reescribe esos valores. Últimas fechas guardadas en producción: USD/ARS 10 de septiembre, BRL/ARS 9 de septiembre y USD/BRL 1 de octubre de 2026.

## Configuración y cobertura de ejecución

Producción tiene los **15 CronJobs previstos** y un Deployment `rag-worker`. El overlay coincide con las suspensiones observadas. Todos los CronJobs tienen exclusión de concurrencia, imágenes por digest, límite temporal y comprobación inicial de base. Las operaciones de aplicación comparten bloqueo de base con las ejecuciones manuales. Horarios siguientes expresados en Argentina; los manifiestos usan UTC.

- `sync-rates`: diario 03:30; habilitado y fallido hoy. Corregido localmente el endpoint BCRA; pendiente DNS BCB y publicación.
- `billing`: diario 04:00; suspendido. Historial del 1 y 2 de octubre con error por `invoices.company_id` nulo; el writer actual ya delega al backend. Hay un contrato de alquiler activo y su `next_billing_date` está ausente. Requiere validar datos y ejecución de la versión vigente antes de reactivar.
- `sync-indices`: diario 03:00; suspendido. El CLI actual cubre ICL diario, IPC e IGP-M mensuales y revisiones; la tabla productiva `inflation_observations` tiene **cero filas**. Los éxitos de jobs históricos no acreditan cobertura de esa tabla.
- `process-settlements`: día 2, 04:00; suspendido. Es un preview legado; rechaza escrituras. La generación y los pagos vigentes están en el backend. Su cálculo legado no acredita liquidaciones contables multimoneda, imputaciones parciales ni retenciones completas.
- `overdue`: diario 05:00; último Job completo hoy.
- `reminders`: diario 06:00; último Job completo hoy. El éxito sin facturas no prueba envío real a un proveedor.
- `lease-renewal-alerts`: diario 08:00; último Job completo hoy.
- `reports`: día 1, 07:00; último éxito el 1 de octubre, con 12 ejecuciones individuales completas.
- `rag-reconcile`: diario 23:30 del día anterior; último Job completo. `rag-purge-audit`: domingo 00:15; último éxito el 27 de septiembre. `rag-worker` está ejecutándose; outbox: 54 procesadas, sin pendientes ni fallidas al corte.
- `retry-communications`: cada minuto; completo. `process-whatsapp-inbox`: cada minuto; completo pero sin procesar mensajes porque `WHATSAPP_INBOUND_ENABLED` no está configurado y su default es `false`. Hay **cuatro mensajes pendientes**, disponibles y sin intentos, con el más antiguo recibido el 14 de septiembre. La habilitación del canal requiere decisión operativa.
- `apply-whatsapp-retention`: diario 01:15; completo hoy.
- `database-backup`: diario 00:45; último Job completo hoy. `restore-drill`: día 15, 01:15; último Job completo el 15 de septiembre. Se constató estado Kubernetes, sin ejecutar restauraciones ni auditar nuevamente sus archivos.
- `reconcile-bank`: manual y disponible en workflow; no tiene cron por decisión documentada. Los comandos RAG `rag-backfill`, `rag-verify`, `rag-build-index`, `rag-purge-stale` y `rag-recall` también son administrativos manuales. No necesitan un cron para cumplir ese uso.

Se corrigió la ejecución manual de `reports`: antes invocaba el CLI sin el propietario requerido; ahora usa el wrapper de todos los propietarios y ambos tipos, con preview. Se agregó `sync-rates --dry-run`; `sync-indices` con preview se rechaza antes de crear un Job, porque el CLI no ofrece ese modo. La conciliación manual ahora conserva su propia etiqueta de monitoreo, en lugar de confundirse con `reports`.

El crontab y el runbook estaban desactualizados: reporte sin propietario, índices mensuales/IGP-M deshabilitado, escrituras legadas de liquidación y uso de Chromium. Se alinearon con el runtime vigente y se marcaron como históricos los cron nativos, conservando las suspensiones financieras. También se corrigió el período de preview de liquidación: enero ya no produce `YYYY-00` y el cambio de mes respeta Argentina.

## Reportes existentes y faltantes

Existen resumen mensual y liquidaciones registradas en PDF, por propietario y mes, con monedas separadas y controles contables. El wrapper incluye todos los propietarios vigentes, independientemente del acceso al portal; continúa tras un fallo individual y termina con código no cero si hubo errores.

En producción hay **24 documentos con cabecera PDF válida**, 12 resúmenes y 12 liquidaciones, generados el 1 de septiembre y el 1 de octubre. Hay seis propietarios. La base tiene **cero facturas, liquidaciones e imputaciones** al corte: estos PDF acreditan ejecución y almacenamiento, pero no un cierre financiero con movimientos reales. Las pruebas locales cubren los cálculos y rechazos correspondientes.

La pantalla web y la móvil muestran ejecuciones y estados mediante `/dashboard/reports`. Esa pantalla no es un generador interactivo ni ofrece descarga del PDF; el DTO no vincula cada ejecución con su documento. La descarga genérica de Documentos existe por separado. Reejecutar un mismo reporte crea un documento nuevo, sin una política explícita de versiones/idempotencia por propietario y período.

Faltan catálogo de informes financieros (rent roll, mora por antigüedad, resultados con gastos, flujo de caja/proyección y reportes fiscales), filtros interactivos, exportación Excel y programación configurable de distribución diaria/semanal/mensual. El cron actual **genera y guarda** reportes; no los envía a propietarios.

Esos informes ampliados aparecen en `functional/drf-original.md`, que el catálogo marca como histórico y reemplazado. No se los presenta como criterios obligatorios ya incumplidos del contrato vigente: Producto debe confirmar cuáles incorpora. Sí representan faltantes de la capacidad de reportes solicitada en esta revisión.

El esquema llega a `142_maintenance_notice_events.sql`; existen 51 entradas históricas sin checksum. No se reconstruyeron ni aprobaron esos hashes: Operaciones debe documentar su baseline y verificar integridad antes de afirmar cobertura completa de migraciones.

## Pendientes priorizados

1. **P1 operativo:** publicar y verificar la corrección de cotizaciones, resolver DNS BCB y revisar valores históricos. La alerta sigue pendiente hasta un Job exitoso y la actualización del monitor; no borrar el Job fallido para ocultarla.
2. **P1 operativo:** validar calendarios/datos históricos de facturación, cargar y verificar observaciones de índices, y resolver los cuatro mensajes pendientes junto con la configuración de entrada. Conservar las suspensiones hasta completar esas decisiones.
3. **P1 producto:** conectar historial con descarga del PDF y definir versiones/reintentos de reportes. Acordar el catálogo y exportación de informes ampliados.
4. **P2 observabilidad:** alertar por antigüedad del último éxito de cada tarea y por colas pendientes/dead letter. La condición actual cuenta Jobs fallidos retenidos en Kubernetes, con TTL de 24 horas; un Job `Complete` o su expiración no acredita resultados funcionales.
5. **P2 operación:** conciliar una ejecución `exchange_rates` que permanece `running` desde el 22 de julio. No se modificó su estado histórico.

## Fotos de propiedades

La web recibía rutas `/properties/images/<id>` y, con `NEXT_PUBLIC_API_URL=/api`, perdía el prefijo al intentar resolverlas como una URL absoluta. La ruta pública incorrecta redirigía por idioma y terminaba en 404. Se centralizó la resolución de imágenes para propiedades, contratos e inquilinos; también se corrigieron las rutas relativas en móvil. Se conservan las firmas de las imágenes temporales.

Las seis fotos permanentes de producción respondieron HTTP 200 por `/api/properties/images/<id>` (cinco JPEG y un PNG). No fue necesario modificar archivos ni habilitar `/uploads`. La corrección queda local y requiere publicación. Validación: 41 pruebas web y 35 móviles; tipos y lint aprobados en ambas aplicaciones.

## Validación de las correcciones

Se validaron las suites batch, el despacho manual y el wrapper con fixtures aislados, incluido preview sin guardar cotizaciones, continuación tras fallos, ambos tipos por propietario y cambio de año/mes. También se comprobaron tipos, lint, compilación y sintaxis shell. Resultados: **32 suites y 337 casos batch**, **10 pruebas Python** de despacho/wrapper; tipos, lint y compilación aprobados. Cobertura global: líneas 90,64 %, ramas 80,76 %, funciones 89,56 %, sentencias 90,44 %; todos los umbrales configurados aprobados. `bash -n` y `git diff --check` sin errores. [Snapshot y resultados resumidos](evidence/2026-10-03-batch-audit/runtime.json).

Alcance limitado: producción se inspeccionó en lectura. No se ejecutaron facturación, pagos, envíos, purgas, backfills ni pruebas sobre `oracle`; no se creó ningún Job, se publicaron imágenes ni se modificaron alertas. Ninguna suite garantiza ausencia absoluta de errores ni sustituye una verificación funcional posterior al despliegue.
