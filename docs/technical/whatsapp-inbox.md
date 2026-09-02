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
hasta cerrar el outbox de salida y la bandeja de propuestas.

## Privacidad y abuso

Los logs no incluyen teléfono, texto, transcripción ni detalle devuelto por el
proveedor. Identifican al remitente o destinatario mediante un HMAC truncado,
estable dentro del entorno, para permitir correlación operativa sin exponer el
dato original.

`WHATSAPP_INBOUND_DAILY_LIMIT` limita por usuario y empresa los mensajes
recibidos en una ventana de 24 horas (50 por defecto). El consumo se registra
atómicamente en la misma sentencia que deduplica el WAMID. Al excederlo se
conservan el WAMID y un marcador `[rate-limited]`, pero no se almacena el texto,
no se descarga/transcribe audio, no se invoca IA y no se responde. El control se
aplica únicamente después de resolver de forma unívoca a un usuario con opt-in.

La política de datos tiene estos valores por defecto, todos configurables como
enteros positivos:

- `WHATSAPP_INBOX_RETENTION_DAYS=7`: borra payloads ya procesados.
- `WHATSAPP_DEAD_LETTER_RETENTION_DAYS=30`: borra dead letters vencidas.
- `WHATSAPP_COMMUNICATION_RETENTION_DAYS=365`: redacta cuerpo y errores de
  comunicaciones asociadas a WhatsApp.
- `WHATSAPP_OUTBOUND_RETENTION_DAYS=90`: redacta teléfono, texto, URL de PDF,
  error y payloads crudos del tracking de salida.

Los estados pendientes, fallidos con reintentos disponibles o en procesamiento
no se eliminan automáticamente.

## Operación

Las comunicaciones creadas mediante `CommunicationsService` se persisten en
`communication_deliveries` con estado `queued`; crear, aprobar o reintentar una
entrega no llama al proveedor dentro de la petición. El procesador reclama hasta
100 filas con `FOR UPDATE SKIP LOCKED`, incrementa intentos y asigna un lease de
cinco minutos. Un worker caído se recupera al vencer el lease.

Cada entrega usa su UUID como clave idempotente en `whatsapp_messages`. Si Meta
respondió y el estado de la entrega no llegó a persistirse, el siguiente intento
recupera el WAMID ya registrado sin volver a contactar al proveedor. La migración
`104_harden_communication_delivery_outbox.sql` agrega el estado `processing`, el
lease y el índice único de idempotencia.

La migración `105_expand_communication_outbox_events.sql` incorpora respuestas
manuales y del asistente, amplía los roles destinatarios y vincula de forma única
la comunicación de origen. La respuesta manual bloquea mensaje y consentimiento,
y guarda respuesta, entrega y actividad en una sola transacción. La respuesta del
asistente guarda entrega y metadatos juntos. Los avisos de visita y las notas de
crédito también se encolan mediante `CommunicationsService`.

La migración `106_queue_ad_hoc_whatsapp_messages.sql` agrega el evento ad hoc y
una clave idempotente única por compañía. Los endpoints público e interno sólo
encolan después de validar compañía, destinatario, consentimiento y teléfono. El
endpoint autenticado exige una actividad relacionada; batch envía empresa, rol,
destinatario y una clave estable del evento. Templates con PDF derivan claves
distintas y estables para cada componente.

Programar el procesador de comunicaciones al menos una vez por minuto:

```bash
cd backend
npx ts-node src/communications/retry-communications.cli.ts
```

Requiere `APP_URL` y `BATCH_COMMUNICATIONS_INTERNAL_TOKEN`. Ningún controlador ni
productor de dominio invoca al proveedor directamente; sólo el worker usa el
adaptador de Meta. Las herramientas administrativas de WhatsApp tampoco se
exponen al catálogo de IA.

Programar cada minuto, con exclusión solapada si el scheduler no la ofrece:

```bash
cd batch
npm start -- process-whatsapp-inbox --limit 25
```

El comando llama al backend mediante `BACKEND_INTERNAL_URL` y
`BATCH_WHATSAPP_INTERNAL_TOKEN`. El límite efectivo está entre 1 y 100.

Programar además una ejecución diaria de retención:

```bash
cd batch
npm start -- apply-whatsapp-retention
```

Este comando usa el mismo canal interno autenticado y devuelve los conteos de
filas borradas y redactadas. Las actualizaciones son idempotentes.

Control operativo:

```sql
SELECT status, count(*) AS events, max(attempts) AS max_attempts,
       min(received_at) AS oldest
FROM whatsapp_webhook_inbox
GROUP BY status;
```

Alertar ante cualquier `dead_letter`, ante crecimiento sostenido de `failed` o
si un `processing` supera `lease_expires_at`. Alertar también cuando aparezcan
mensajes con `metadata->>'abuseLimited' = 'true'`; revisar el límite antes de
aumentarlo y mantener evidencia del motivo del cambio.

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
