# Cobros, correcciones financieras y mora

Las migraciones 136, 139 y 141 se aplican antes de publicar el backend. Conservan
historial y permiten corregir el resultado contable sin modificar importes de
comprobantes o transferencias anteriores. La configuración de impuestos sobre
comisiones se administra en `GET/PATCH /companies/current/financial-settings`;
cada cambio registra actor, fuente, vigencia y configuración previa. Las compañías
existentes conservan el parámetro anterior con procedencia de migración. Una
compañía nueva debe configurar su política antes de emitir comisiones.

## Checkout y devoluciones

El checkout persiste su intención antes de contactar Mercado Pago, cobra sólo
el saldo pendiente y usa el ID de intención como referencia e idempotencia del
proveedor. Un reintento con `Idempotency-Key` recupera el checkout confirmado.
Una respuesta perdida conserva el estado incierto: no vuelve a enviar la creación
hasta reconciliar la intención con el proveedor. Un webhook sin intención
persistida, o un cobro histórico aprobado sin su pago contable, requiere revisión.

La aprobación confirmada utiliza el mismo cobro, imputación, movimiento de cuenta,
recibo y cola documental que el circuito manual. La devolución remota acumulada
aplica únicamente la diferencia pendiente. Replay, devolución antes del aviso de
aprobación y avisos de aprobación posteriores a una devolución total no duplican
cobros ni movimientos. PDFs y avisos se procesan después del commit.

`POST /payments/:id/refunds` recibe `amount`, `reason` y `Idempotency-Key`.
Devuelve primero el crédito no imputado y luego revierte las imputaciones más
recientes, con centavos exactos. Una devolución parcial mantiene el cobro completo
con su importe devuelto acumulado; la devolución total lo deja `refunded` y anula
el recibo original. `GET /payments/:id/refunds` y
`GET /payments/:id/refunds/:refundId/pdf` conservan la constancia de cada corrección.
Anular después de una devolución revierte sólo el remanente.

## Facturas y liquidaciones

Anular una factura revierte su cargo, revoca notas vinculadas y registra las
correcciones de comisiones. El dinero previamente cobrado queda como crédito del
inquilino; devolverlo es una operación explícita e independiente. Una factura
anulada conserva su estado terminal cuando posteriormente se revierte el cobro.

Una devolución o anulación de un cobro transferido conserva la liquidación
original y agrega `settlement_source_compensations`. La deuda del propietario se
calcula por diferencia entre la fuente histórica y la recaudación vigente, con
la comisión histórica y redondeo acumulado. Esto conserva también los centavos
de comisión en devoluciones sucesivas. `compensationAmount` permite consultar la
corrección por liquidación y moneda; el historial pagado conserva el importe
real de la transferencia. Aplicar esa deuda a un pago futuro requiere una decisión
administrativa explícita, sin volver a transferir el importe histórico.

Las transferencias en curso o inciertas deben reconciliarse antes de cambiar sus
fuentes. Las liquidaciones históricas transferidas sin fuentes verificables
bloquean reversiones y requieren revisión. La antigua ruta de pago en propietarios
responde 503; los pagos se tramitan por el workflow verificado de liquidaciones.

## Mora opcional y reproducible

La mora se agrega únicamente con `applyLateFee: true`. El cálculo usa fecha de
Argentina, capital pendiente sin intereses previos, días completos posteriores
al plazo de gracia, política explícita del contrato y un tope total por cuenta.
Porcentajes y montos fijos se calculan en centavos; los porcentajes redondean una
vez por factura fuente. El cálculo resta importes ya emitidos y auditados para
no volver a facturar la misma mora.

Cada factura generada guarda `late_fee_calculation`: fecha, zona horaria, moneda,
política, facturas fuente, capital, días, monto acumulado y monto ya facturado.
La evidencia no puede modificarse. Anular una factura conserva la evidencia,
pero su cargo deja de contar como mora emitida. Los importes históricos de mora
sin fuentes auditadas bloquean el cálculo automático, sin inferir una política.
La facturación programada sigue usando su habilitación y verificación existentes.

## Inventario y corrección de históricos

Estas consultas son de diagnóstico y no modifican saldos:

```sql
-- Mora anterior sin evidencia reproducible.
SELECT company_id, id, invoice_number, currency, late_fee_amount, status
FROM invoices
WHERE deleted_at IS NULL AND late_fee_amount > 0
  AND late_fee_calculation IS NULL
ORDER BY company_id, id;

-- Transferencias históricas sin una generación auditable.
SELECT o.company_id, s.id, s.owner_id, s.period, s.currency, s.net_amount,
       s.transfer_reference
FROM settlements s JOIN owners o ON o.id = s.owner_id
WHERE s.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM settlement_generations g
                  WHERE g.settlement_id = s.id)
ORDER BY o.company_id, s.period, s.id;

-- Checkout aprobado anterior sin cobro contable asociado.
SELECT company_id, id, invoice_id, amount, external_payment_id
FROM payment_gateway_transactions
WHERE status IN ('approved', 'refunded') AND payment_id IS NULL
ORDER BY company_id, id;
```

Para cada incidencia, reunir contrato, extracto, comprobantes y fuentes por
compañía y moneda; cotejar los movimientos vigentes antes de decidir una
corrección. No borrar evidencia inmutable ni reactivar recibos anulados. Si no
hay fuentes suficientes, mantener la operación bloqueada y documentar el caso.

Pruebas PostgreSQL cubren devoluciones parciales y concurrentes, replay de
Mercado Pago, anulación de factura pagada, corrección de liquidación transferida,
comisión histórica, mora optativa e inmutable y rollback de históricos ambiguos.
Las pruebas usan proveedores simulados y no envían pagos reales.
