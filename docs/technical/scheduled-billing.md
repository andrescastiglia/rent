# Facturación programada con el servicio común

El comando `billing` llama a `POST /invoices/internal/generate-due`. El backend
selecciona contratos y ejecuta el mismo servicio transaccional usado por HTTP/IA.
Se retiraron del batch la inserción directa de facturas, numeración por propietario,
actualización aislada del calendario, PDF inline y notificación inmediata. El
batch conserva el registro operativo en `billing_jobs`; los comandos de vencidos
y recordatorios son recorridos distintos y no se consideran unificados aquí.

## Selección y recuperación

La API requiere una credencial independiente `BATCH_BILLING_INTERNAL_TOKEN`, enviada
como `x-batch-billing-token`; ausente devuelve 503, incorrecta 401. Es configuración
futura: no se creó una credencial real ni se habilitó el cron. Los valores de CI y
pruebas son locales. El CLI usa `BACKEND_INTERNAL_URL` y admite `--company-id`,
`--lease-id`, `--date YYYY-MM-DD` y `--dry-run`. Sin fecha usa el día de Argentina.

Solo selecciona alquileres activos, no borrados y vigentes en la fecha solicitada,
con calendario pendiente. Respeta primer día, último día, día del contrato y día
personalizado; una ejecución posterior al día previsto recupera el atraso. Los
días 29–31 se ajustan al fin de mes. La migración 124 amplía a 31 las restricciones
de base de datos, API y formulario web. Un calendario personalizado sin día produce
un error explícito. Las frecuencias de período siguen el cálculo común del contrato.

La selección pagina por UUID ascendente, hasta 100 contratos por página. Un error
en un contrato no impide procesar los demás y el cursor avanza también sobre los
fallidos. Cada contrato se confirma en su propia transacción; dentro del bloqueo
se vuelve a validar elegibilidad, período y vencimiento para rechazar selecciones
obsoletas. La cuenta corriente debe estar activa y usar la moneda del contrato.

Se deriva una clave estable por compañía, contrato y fecha de ejecución. La
asociación de la migración 123 conserva también `scheduledFor` y el período pedido.
Una nueva ejecución de la misma fecha recupera ese período si quedó otro mes
atrasado; no factura automáticamente el siguiente mes tras perder una respuesta.
Si el contrato ya dejó de ser elegible no vuelve a seleccionarlo. El alcance es un
período por contrato y fecha de ejecución, no una facturación automática de todo
el histórico. Cambiar la fecha es otra ejecución; los períodos explícitos ya
existentes siguen devolviendo conflicto para revisión, incluso si son borradores.

No hay reintento HTTP ciego del CLI. Ante timeout conserva el fallo del job; volver
a ejecutar con la misma fecha y filtros permite recuperar por clave. El resumen
usa `invoicesProcessed` para facturas generadas o recuperadas, nunca pretende contar
solo nuevas inserciones. Los totales son strings decimales separados por moneda,
sumados en centavos enteros. Un fallo parcial deja el job en `partial_failure` y
el comando termina con código 1. `--dry-run` valida calendario y muestra candidatos,
sin generar facturas, ajustar alquileres o simular importes; sí registra el job.

## Cambio respecto del cálculo antiguo

La facturación programada conserva la moneda, gastos adicionales y ajuste del
contrato según el backend. Se elimina la conversión automática a ARS del batch:
cargar un importe convertido en una cuenta denominada en otra moneda mezclaba
unidades. No se agrega una conversión implícita ni se solicita un tipo de cambio
por red dentro de la transacción. Las conversiones que requieran una decisión
comercial explícita siguen siendo un trabajo separado.

Los ajustes por índice pasan al [cálculo común con evidencia](rent-adjustments.md):
ICL por cociente diario, IPC por niveles mensuales e IGP-M por porcentajes compuestos.
Se usan observaciones versionadas, fechas contractuales y rezago mensual explícito;
no se toma solo la última variación ni se sustituye un período faltante. La revisión
de contratos/datos reales y su configuración sigue pendiente antes de habilitar
la facturación programada en producción.

Tampoco se restan automáticamente las retenciones fiscales del propietario a la
deuda del inquilino. Se mantiene el flujo de retenciones explícitas de liquidaciones,
que continúa deshabilitado junto con Mercado Pago Payouts por instrucción del usuario.
Esto cambia el comportamiento antiguo de `WithholdingsService` en facturación;
no afirma reproducirlo ni validar normativa tributaria. No se modifican facturas
históricas ni se inventan ajustes para conciliar datos anteriores.

La mora no se agrega automáticamente: permanece como opción del servicio común.
Se retiró el método batch no expuesto por CLI que modificaba el total de una factura
ya emitida. La [mora optativa guarda evidencia auditable](financial-corrections.md) y respeta
gracia y tope; los reintentos no repiten el cargo.

## Documento y aviso

La emisión guarda el snapshot y trabajo documental en la transacción del cargo.
El worker guarda PDF y aviso en `communication_deliveries` juntos: si falla cualquiera,
revierte ambos y reintenta el trabajo. Conserva el PDF histórico aunque luego se
cancele la factura, pero solo prepara avisos para facturas todavía cobrables.

El snapshot nuevo incluye el ID del inquilino original. El worker exige que siga
siendo la parte del contrato, en la misma compañía, con teléfono, consentimiento
y canal WhatsApp habilitados. Los snapshots anteriores sin ID no generan avisos.
El envío vuelve a verificar factura, parte, teléfono y consentimiento; una baja,
pago, cambio de destinatario o revocación impide ese intento. El envío usa la cola
existente y la plantilla `invoice_available`; generar una factura nunca hace la
llamada externa. Se corrigió también la lectura del resultado `UPDATE RETURNING`
de PostgreSQL en el procesador de comunicaciones para reclamar las filas reales.

## Verificación y despliegue

Pruebas con PostgreSQL cubren concurrencia, rollback, cambio de moneda/selección,
recuperación con meses atrasados, políticas de fecha, día 31, paginación, alcance
de compañía, credencial interna, consentimientos y recuperación documental.
`batch/scripts/verify-billing-integration.cjs` ejecuta el CLI real contra el backend,
comprueba preview, emisión y repetición de la misma fecha; verifica cargo, comisión,
outbox, clave, estadísticas y salida con fallo parcial, y elimina solo su fixture.
CI ejecuta esta prueba.

Validación local: 1.404 unitarias backend, 271 E2E (29 de facturación), 172 pruebas
batch y 438 web. Se comprobaron lint, tipos backend/batch/web/mobile, compilación
backend, generación OpenAPI, YAML de CI y aplicación repetida de 124. Los 23
controles de CI del PR #238 aprobaron sobre `5bfdb10`; incorporado a main.
El despliegue del nuevo batch todavía requiere verificación independiente.

Aplicar 122–124 antes del backend y batch compatibles. Mantener el cron suspendido
hasta verificar el despliegue y la configuración operativa. No se configuran BFA,
Mercado Libre ni Mercado Pago. Un rollback conserva claves y snapshots; no volver
al escritor retirado, que puede crear facturas parciales sin cargo común.
