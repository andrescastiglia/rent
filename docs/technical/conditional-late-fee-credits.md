# Bonificaciones por mora al anular cobros

Al completar una factura, Rent mantiene la política existente de emitir una
nota de crédito por su mora. Las nuevas notas registran el origen explícito
`late_fee_settlement`. Si se anula cualquier cobro imputado y la factura deja
de estar íntegramente pagada, la misma transacción anula la bonificación y
reintegra su importe al saldo. Conserva el cobro que originó la nota y registra
por separado `cancelled_at` y `cancelled_by_payment_id`.

Ejemplo: factura de 110, con mora de 10, pagada mediante cobros de 50 y 60.
La bonificación deja saldo -10. Anular el primer cobro revoca la nota emitida
con el segundo y deja saldo 50. Anular luego el segundo deja saldo 110 sin
revertir dos veces la nota. Un pago de reemplazo de 50 puede completar nuevamente
la factura y generar una nueva bonificación; se conserva la nota anulada.

Los bloqueos de cuenta y nota serializan las anulaciones. Un índice admite una
sola bonificación activa por compañía/factura. El generador de PDF bloquea la
nota antes de leer sus relaciones y conserva el bloqueo hasta guardar el
documento y encolar el aviso; no puede sobrescribir una anulación concurrente.
El trigger impide reactivar una nota anulada o alterar su causa de anulación.

Antes de enviar un aviso de nota de crédito, el worker comprueba su vigencia,
cobro de origen, adjunto, compañía, destinatario, teléfono, canal y consentimiento
actuales. Un aviso que perdió elegibilidad falla sin llamar al proveedor y sigue
la política limitada de reintentos existente. Esta comprobación no retira avisos
ya enviados ni garantiza atomicidad entre PostgreSQL y un proveedor externo:
una anulación posterior a la comprobación puede coincidir con un envío en curso.

## Historial y despliegue

Aplicar la migración 130 antes del backend. Es repetible y no asigna un origen
inventado a notas históricas. Las notas independientes sin cobro se conservan.
Una nota vigente sin origen, vinculada a otro cobro de la factura, bloquea la
anulación con revisión manual y revierte toda la transacción. También se exige
revisión antes de emitir otra bonificación sobre una factura con notas históricas
vigentes vinculadas a cobros. La anulación del propio cobro mantiene el circuito
histórico de reversión de sus notas. No se reparan saldos históricos automáticamente.

No borrar las columnas de auditoría al revertir una versión. Una versión anterior
no aplica la revocación entre cobros; suspender estos cambios contables antes de
volver a ella. Crons e integraciones externas permanecen deshabilitados.

Las pruebas PostgreSQL cubren anulación fuera de orden, reemplazo de cobro,
anulaciones concurrentes, unicidad, historial ambiguo, rollback, preservación de
notas independientes, PDF concurrente, nota revocada antes del PDF y elegibilidad
del aviso con proveedor simulado. No envían mensajes reales.

Quedan pendientes la política opcional y auditable de mora, la revisión de
liquidaciones ya transferidas, la anulación directa de facturas con notas vigentes
y la revalidación de avisos de recibos. La migración 131 reemplaza la numeración
de recibos/notas por [contadores persistentes](payment-document-numbers.md),
incluyendo importaciones y registros históricos fuera de orden.
