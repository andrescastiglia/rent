# Recuperación de cobros aprobados

`post_payments`, `patch_payment_by_id`, `patch_payment_confirm` y
`patch_payment_cancel` usan `domain_operation_receipts` (migración 128), con
clave estable del contexto de aprobación, alcance por compañía y comparación
de operación/argumentos. Reutilizan las garantías de la
[bandeja y confirmación](approved-invoice-recovery.md): reautenticación,
recuperación de intentos vencidos, protección frente a trabajadores tardíos y
bloqueo de ejecuciones históricas sin garantía transaccional.

Alta y conceptos se guardan juntos, también por HTTP. La edición adquiere el
bloqueo de la fila del pago antes de comprobar que está pendiente, y comparte
transacción con el reemplazo de conceptos y la lectura del resultado. Si compite
con una confirmación, esta usa los conceptos/importes editados o la edición
rechaza el pago ya confirmado. Omitir moneda o actividad en una edición preserva
los valores actuales, tanto en HTTP como en IA; los valores predeterminados de
creación ya no se aplican a PATCH. Vaciar conceptos con un importe explícito
guarda ese importe.

Confirmación y anulación guardan el resultado dentro de la transacción de sus
movimientos, imputaciones, recibos, notas de crédito y outbox. La lectura final
usa el mismo gestor transaccional. Un error al guardar la constancia revierte
todos esos cambios; la conciliación bancaria conserva su gestor externo.
PDF y comunicaciones continúan ejecutándose después del commit desde outbox.

Recuperar devuelve el resultado original aunque el pago haya sido anulado o
dado de baja lógicamente. La consulta del pago muestra su estado actual y los
documentos generados posteriormente. Los permisos y el modo de IA se validan
en cada intento; no se reutilizan claves para otros pedidos u operaciones.
Esto no habilita recuperación de las demás herramientas mutables.

`payment-flow.e2e-spec.ts` prueba pérdida de respuesta tras commit en las cuatro
operaciones, recuperación concurrente después de baja lógica, aislamiento entre
dos compañías y roles, un único cobro/reversión/imputación/recibo/cola y rollback
íntegro ante fallo al guardar la constancia. Comprueba además creación concurrente,
cambio de argumentos, edición concurrente con confirmación y preservación de
moneda/actividad por HTTP e IA. Se mantienen las pruebas del flujo contable,
documentos y conciliación bancaria.

Aplicar las migraciones 127 y 128 antes del backend. Para rollback conservar las
constancias y no reejecutar aprobaciones en versiones que ignoren sus claves.
Las incidencias se consultan en la bandeja y en los eventos de ejecución de IA.
Los proveedores externos permanecen deshabilitados y los crons suspendidos.
