# Recuperación de facturas aprobadas

La garantía cubre `post_invoices_generate_for_lease`, `post_invoices`,
`patch_invoice_issue` y `patch_invoice_cancel`. La aprobación usa
una clave estable: `pending_actions.execution_key` en la bandeja o el ID de
confirmación en la conversación. La clave del contexto prevalece sobre la del
payload. Los permisos y el alcance de compañía se validan en cada ejecución.

La generación guarda `invoice_generations.result_snapshot` junto con la factura,
el avance del calendario y, si se emite, su cargo, dentro de una misma transacción.
El bloqueo transaccional por compañía/clave serializa intentos concurrentes.
La recuperación comprueba el mismo pedido y devuelve el resultado original
antes de releer el contrato; no genera otro período ni otro cargo. Ese resultado
es histórico: una factura anulada posteriormente sigue figurando con el estado
original en la constancia. La consulta de factura muestra su estado actual.
El comportamiento HTTP habitual conserva la consulta del registro actual.

El alta manual, la emisión y la anulación usan `domain_operation_receipts`
(migración 128). Comparten el mismo mecanismo: bloqueo por compañía/clave,
comparación de operación y argumentos, resultado inmutable y escritura dentro
de la transacción de dominio. Reutilizar una clave con otro pedido u operación
produce conflicto; una escritura fallida del resultado revierte también los
movimientos, la comisión y la cola de PDF. La clave no depende del estado actual
de la factura y se conserva tras cambios o baja lógica. Los endpoints HTTP sin
clave mantienen su comportamiento habitual; la clave proviene del contexto de
aprobación de IA, no de un argumento libre del modelo.

La bandeja permite recuperar acciones fallidas o con un intento vencido después
de dos minutos, únicamente si fueron adquiridas con `retry_safe=true` y la
herramienta conserva su contrato de recuperación. Exige reautenticación y un
revisor distinto del solicitante. Cada intento recibe un token: un trabajador
anterior no puede sobrescribir el resultado de quien lo reemplazó. El dashboard
ofrece «Recuperar ejecución» para esos casos y no permite rechazarlos como si
todavía fueran propuestas pendientes. Se conserva el revisor de la aprobación
original.

La confirmación de conversación se puede repetir explícitamente con el mismo
ID, usuario, compañía, conversación y hash de argumentos, solo para ejecuciones
marcadas recuperables. Una propuesta enviada a la bandeja exige ese circuito de
revisión y no admite confirmación directa desde la conversación.

La migración 127 agrega el snapshot y los campos de recuperación sin reconstruir
resultados históricos. Acciones ya fallidas/en ejecución sin `retry_safe` no se
repiten. Una clave histórica sin snapshot exige revisión manual. Las demás
herramientas mutables no adquieren esta garantía; cada una necesita un resultado
persistido atómicamente con su efecto antes de habilitar recuperación. No se
activa ningún proveedor ni cron.

Pruebas PostgreSQL cubren pérdida de respuesta después del commit, recuperación
tras anular la factura, un único cargo/clave, snapshot inmutable, reintento de
confirmación, bloqueo de ejecuciones históricas, vencimiento del intento y
protección ante trabajadores tardíos. Se verificaron también compañía,
autoaprobación, reautenticación, integridad y el control de recuperación en web.
Para alta, emisión y anulación se comprueban respuestas perdidas, recuperación
tras baja lógica, entregas concurrentes, cambio de argumentos/operación,
inmutabilidad y rollback completo ante un fallo al persistir el resultado.

Despliegue: aplicar primero las migraciones 127 y 128, después el backend. Un
rollback conserva tablas y resultados: no borrar recibos ni habilitar reintentos
en código anterior que ignore las claves. Observar acciones fallidas/vencidas
en la bandeja y errores de integridad; las escrituras externas siguen en outbox.
