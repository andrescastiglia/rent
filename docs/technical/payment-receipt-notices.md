# Revalidación de recibos pendientes de envío

El worker de comunicaciones comprueba cada aviso `payment_received` antes de
llamar a WhatsApp, incluso cuando el aviso ya fue aprobado o se reintenta
manualmente. La confirmación y la generación de PDF siguen usando sus outboxes;
este control cubre los cambios ocurridos después de encolar la comunicación.

La entrega requiere un cobro completado y sin baja, un recibo sin anular, importe
y moneda consistentes, y el mismo PDF registrado en el recibo. El ID del recibo
debe estar en `metadata.receiptId` y vinculado al cobro de la comunicación. Se
comprueban compañía, cuenta, contrato, inquilino y usuario vigentes. El destinatario
debe tener rol de inquilino y coincidir con el titular del cobro/cuenta, su teléfono
actual, consentimiento de contacto y WhatsApp habilitado. Una preferencia explícita
por otro canal impide el envío.

Si se anula el cobro o el recibo, cambia el destinatario/adjunto o se revoca el
consentimiento, el intento falla sin invocar al proveedor. Conserva el estado
`failed`, el motivo visible y el límite de reintentos existente. Un reintento
manual vuelve a comprobar las mismas condiciones; no permite omitirlas.

Las entregas históricas sin metadatos o relaciones válidas requieren revisión;
no se infieren IDs ni se cambia automáticamente el destinatario. Esta revisión
no retira mensajes enviados. La lectura de PostgreSQL y el envío externo no son
atómicos: una anulación posterior a la comprobación puede coincidir con un envío
ya iniciado. No se afirma una garantía de entrega exactamente una vez por parte
del proveedor.

Las pruebas recorren PostgreSQL con dos compañías, cobro/recibo anulado, estado
incompatible, bajas de entidades relacionadas, teléfono/canal/consentimiento,
rol, adjunto, metadatos y diferencias de importe/moneda. Un caso usa el worker
público y su reintento manual tras anular el cobro. Los proveedores están simulados;
no se envían mensajes reales. El cambio no requiere una migración adicional y
mantiene los crons y proveedores externos deshabilitados.
