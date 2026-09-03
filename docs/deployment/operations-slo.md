# Operación, SLO y guardias

**Owner primario:** operación de Rent  
**Escalamiento:** responsable técnico de backend  
**Objetivo:** restaurar servicio antes de consumir el error budget mensual.

## Objetivos de servicio

- Disponibilidad API mensual: **99,9 %**, medida como respuestas no-5xx sobre
  solicitudes HTTP instrumentadas.
- Latencia API: **p95 menor o igual a 2 segundos** en ventanas de 5 minutos.
- Telemetría: no más de 10 minutos sin `http_requests_total`.
- Jobs batch: ninguna ejecución fallida sin triage dentro de 15 minutos.

El error budget de disponibilidad es 0,1 % mensual. Una alerta crítica pausa
releases y cambios no relacionados hasta recuperar el servicio y estabilizar el
burn rate. Las reglas ejecutables están en
`observability/prometheus/service-slo-rules.yml` y sus pruebas en el archivo
homónimo `.test.yml`.

## Protocolo de guardia

1. Acusar recibo de una alerta crítica en 10 minutos y warning en 30 minutos.
2. Registrar hora, alerta, SHA activo, impacto, compañía afectada sin PII y
   responsable del incidente.
3. Verificar health, métricas, PM2, PostgreSQL y proveedor dependiente.
4. Mitigar: desactivar integración, reducir tráfico o revertir el enlace
   `current` al SHA anterior según `deployment.md`.
5. Confirmar recuperación en dos ventanas consecutivas y cerrar la alerta.
6. Crear seguimiento con causa, evidencia y acción preventiva.

## RentApiFastErrorBudgetBurn

Impacto: errores 5xx consumen rápidamente el presupuesto de disponibilidad.
Comparar el inicio con el último release, agrupar 5xx por ruta y revisar logs
por trace ID. Si coincide con el despliegue, ejecutar rollback de aplicación.
Si es una dependencia, abrir el circuit breaker o deshabilitar esa integración.

Recuperación: health responde 200 y el burn rate vuelve por debajo de 14,4 en
las ventanas de 5 minutos y 1 hora.

## RentApiSlowErrorBudgetBurn

Impacto: degradación sostenida que agotaría el presupuesto. Revisar rutas,
consultas lentas, pool de conexiones y límites de proveedores. No publicar una
nueva versión hasta estabilizar la hora móvil.

Recuperación: burn rate menor o igual a 6 durante dos evaluaciones.

## RentApiHighP95Latency

Inspeccionar p95 por ruta, saturación, bloqueos PostgreSQL y latencia externa.
Priorizar health y recorridos de cobros. Reducir concurrencia batch si compite
por recursos y revertir el release cuando exista correlación temporal.

Recuperación: p95 menor o igual a 2 segundos durante dos ventanas.

## RentApiMetricsMissing

Verificar `/metrics` con el bearer token, target de Prometheus, expiración del
secreto y proceso backend. Tratar como incidente crítico: sin telemetría no se
pueden demostrar los demás SLO.

Recuperación: `up == 1` y reaparece `http_requests_total`. La prueba Prometheus
del repositorio demuestra disparo a los 11 minutos y recuperación al reaparecer
la serie.

## RentBatchJobFailures

Identificar `job_type`, conservar el registro fallido y revisar si la operación
es idempotente antes de reintentar. Para comunicaciones y RAG usar sus colas y
dead letters; no ejecutar SQL correctivo sin backup.

Recuperación: reintento completado o incidente derivado con datos preservados,
sin nuevos incrementos de `status="failed"` durante 15 minutos.
