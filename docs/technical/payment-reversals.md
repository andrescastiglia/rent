# Estado de factura al anular cobros

La reversión conserva el bloqueo de pago/cuenta/imputaciones/facturas dentro de
la transacción contable. Descuenta la imputación original en centavos exactos
del importe pagado actual. Si la imputación es nula, negativa o excede lo pagado,
rechaza la operación y revierte también el movimiento de cuenta: no ajusta el
saldo a cero para ocultar una inconsistencia.

El estado ya no se copia de la imputación anulada. Si quedan pagos, la factura
queda parcial o pagada según su total. Sin pagos, queda vencida si pasó su fecha
de vencimiento en Argentina; en caso contrario, conserva el último estado
registrado sin pagos (`sent` o `pending`). Para ello consulta la última imputación
que partió de `pending`, `sent` u `overdue`, incluso si fue revertida, con alcance
de compañía/factura. La migración 129 agrega el índice de esa consulta.

Facturas anuladas o reembolsadas conservan su estado terminal aunque cambie el
importe pagado. No se reactivan al anular un cobro. El recibo y las notas vinculadas
al cobro anulado siguen el circuito de reversión existente. Las constancias
transaccionales permiten recuperar el resultado original sin repetir ajustes.

Pruebas: seis regresiones PostgreSQL fallaban antes del cambio. Ahora cubren
pagos fraccionarios, anulación fuera de orden, estado enviado/vencido, preservación
de facturas anuladas, reversiones concurrentes, recuperación y rollback ante
imputación incompatible. La prueba de fecha cubre el cambio de día en Argentina
a las 03:00 UTC; estados terminales y fechas inválidas tienen cobertura unitaria.

La revocación de bonificaciones emitidas por otro cobro se agrega mediante la
migración 130 y el [contrato de notas condicionales](conditional-late-fee-credits.md).
Los saldos de liquidaciones ya transferidas continúan pendientes. No se modifica
automáticamente el historial de reversiones anteriores ni se presume que los
estados históricos incorrectos estén reparados.

Aplicar la migración 129 antes del backend; es repetible y no cambia datos. Para
rollback puede conservarse el índice. Revisar incidencias de imputación en la
bandeja/logs sin repetir manualmente ajustes que ya tengan constancia. Crons y
proveedores externos permanecen deshabilitados.
