# Inbox de webhooks WhatsApp

## Recepción

El endpoint `POST /whatsapp/webhook` valida `x-hub-signature-256` contra el body
crudo y persiste el payload antes de responder 200. La inserción usa un hash
SHA-256 único del evento; al procesar mensajes, el índice único de
`person_communications.whatsapp_message_id` aporta la segunda deduplicación por
WAMID.

La tabla `whatsapp_webhook_inbox`, creada por
`migrations/103_add_whatsapp_webhook_inbox.sql`, conserva estados `queued`,
`processing`, `processed`, `failed` y `dead_letter`. Cada claim es atómico y toma
un lease de cinco minutos. Los fallos reintentan con backoff exponencial de 30 a
3600 segundos y pasan a dead-letter en el quinto intento.

`WHATSAPP_ENABLED` y `WHATSAPP_INBOUND_ENABLED` son opt-in y valen `false` si no
se declaran. Mientras inbound esté deshabilitado, el endpoint verifica y conserva
eventos pero no ejecuta IA ni respuestas. Debe mantenerse así en producción
hasta cerrar outbox, retención/redacción y presupuesto de abuso.

## Operación

Programar cada minuto, con exclusión solapada si el scheduler no la ofrece:

```bash
cd batch
npm start -- process-whatsapp-inbox --limit 25
```

El comando llama al backend mediante `BACKEND_INTERNAL_URL` y
`BATCH_WHATSAPP_INTERNAL_TOKEN`. El límite efectivo está entre 1 y 100.

Control operativo:

```sql
SELECT status, count(*) AS events, max(attempts) AS max_attempts,
       min(received_at) AS oldest
FROM whatsapp_webhook_inbox
GROUP BY status;
```

Alertar ante cualquier `dead_letter`, ante crecimiento sostenido de `failed` o
si un `processing` supera `lease_expires_at`. La política de retención del payload
y la redacción de logs continúan como gates pendientes.

## Rollback y verificación

La migración es aditiva y la tabla puede conservarse al volver al artefacto
anterior. No eliminar eventos pendientes durante el rollback. Con inbound
deshabilitado se puede detener procesamiento sin perder recepción.

Pruebas reproducibles:

```bash
cd backend
npm test -- --runInBand src/whatsapp/whatsapp.service.spec.ts \
  src/whatsapp/whatsapp.controller.spec.ts

cd ../batch
npm test -- --runInBand src/services/whatsapp.service.spec.ts
```
