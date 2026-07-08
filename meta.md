# Meta App Review - Rent

Fecha de ejecucion: 2026-07-07

## Estado

Estado actual: prerequisitos publicos desplegados y paquete de App Review preparado, pero submission no enviada.

No se pudo enviar la submission desde este entorno porque Meta redirige a login de Facebook/Business y requiere una sesion autenticada con permisos de administrador sobre la app y el business:

- App: `855177650884807`
- Business: `4099027493742250`
- Submission: https://developers.facebook.com/apps/855177650884807/app-review/submissions/?business_id=4099027493742250
- Pantalla alcanzada: login de Facebook/Meta Business con campos de email y password.

## Entorno revisado

- Produccion: https://rent.maese.com.ar/
- Login: https://rent.maese.com.ar/es/login
- Usuario reviewer/demo: `admin@rent.demo`
- Password: cargarla solo en el formulario privado de Meta o compartirla por canal seguro. No dejarla commiteada.

Validado con navegador limpio:

- Login exitoso con `admin@rent.demo`.
- Redireccion posterior a login: `https://rent.maese.com.ar/es/dashboard`.
- Perfil mostrado: Admin Demo / admin.
- Secciones cargadas: Panel, Propietarios, Inquilinos, Contratos, Plantillas, Reportes, Pagos, Facturas, Interesados, Usuarios, Personal, Mantenimiento.
- Rutas revisadas:
  - `https://rent.maese.com.ar/es/tenants`
  - `https://rent.maese.com.ar/es/interested`
  - `https://rent.maese.com.ar/es/payments`
  - `https://rent.maese.com.ar/es/tenants/10000000-0000-0000-0000-000000000401/activities/new`
  - `https://rent.maese.com.ar/es/interested/10000000-0000-0000-0000-000000000902/activities/new`

## Alcance real detectado

La integracion Meta usada por Rent es WhatsApp Cloud API. No se detecto un flujo de Facebook Login, Pages o Instagram en la app.

Permisos/features a confirmar dentro del formulario de Meta:

- `whatsapp_business_messaging`: necesario para enviar mensajes de WhatsApp desde el CRM.
- `whatsapp_business_management`: pedirlo solo si el formulario de Meta lo exige para la configuracion del numero, business account, webhooks o templates usados por la app. No pedirlo si la submission solo necesita demostrar envio de mensajes.

Uso tecnico confirmado en codigo:

- Backend envia mensajes a `https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_NUMBER_ID}/messages`.
- Backend expone webhook publico:
  - `GET /api/whatsapp/webhook`
  - `POST /api/whatsapp/webhook`
- Backend sirve documentos PDF con links firmados:
  - `GET /api/whatsapp/documents/:documentId?token=...`
- Frontend llama `POST /api/whatsapp/messages` cuando una actividad CRM de tipo WhatsApp es guardada.

Archivos relevantes:

- `backend/src/whatsapp/whatsapp.service.ts`
- `backend/src/whatsapp/whatsapp.controller.ts`
- `backend/src/whatsapp/dto/send-whatsapp-message.dto.ts`
- `frontend/src/lib/api/whatsapp.ts`
- `frontend/src/app/[locale]/tenants/[id]/activities/new/page.tsx`
- `frontend/src/app/[locale]/interested/[id]/activities/new/page.tsx`
- `backend/src/payments/payments.service.ts`
- `backend/src/properties/property-visits.service.ts`
- `batch/src/services/billing.service.ts`
- `batch/src/services/lease-renewal.service.ts`
- `backend/docs/WHATSAPP.md`

## Casos de uso para justificar

### Caso principal: mensajes WhatsApp desde CRM

Rent permite que administradores inmobiliarios registren una actividad de tipo WhatsApp para un inquilino o interesado. Al guardar la actividad, el sistema crea el registro CRM y envia el texto al telefono de esa persona usando WhatsApp Cloud API.

Dato enviado a Meta/WhatsApp:

- Numero de telefono del destinatario.
- Texto del mensaje.
- Opcionalmente un link firmado a PDF cuando el mensaje incluye un documento.

Justificacion corta para Meta:

> Rent needs WhatsApp Business messaging so real estate administrators can send operational messages to tenants and prospects from the CRM, such as payment reminders, activity follow-ups, visit updates and document notifications. The message is sent only after an authenticated administrator chooses WhatsApp as the activity type and submits the form.

### Caso secundario: documentos y pagos

Cuando se confirma o emite documentacion de pago/factura, el backend puede enviar un WhatsApp con un PDF mediante un link firmado temporal.

Justificacion corta para Meta:

> Rent uses WhatsApp to deliver payment and invoice notifications to tenants, including a signed document link when a PDF is available.

### Caso secundario: avisos automaticos

Los jobs batch envian recordatorios de factura y alertas de renovacion de contrato mediante el endpoint interno `POST /api/whatsapp/messages/internal`, protegido por token interno.

Justificacion corta para Meta:

> Rent sends scheduled operational WhatsApp reminders for rent invoices and lease renewals. These are not marketing campaigns; they are transactional property-management notifications.

## Pasos para reviewers

Importante: antes de grabar o enviar, confirmar que el inquilino/interesado de prueba tenga un numero WhatsApp valido y controlado por el equipo. Los datos demo visibles hoy incluyen telefonos de ejemplo, que pueden no ser entregables por WhatsApp.

### Flujo A: Inquilino

1. Abrir `https://rent.maese.com.ar/es/login`.
2. Iniciar sesion con `admin@rent.demo` y la password cargada en las notas privadas de Meta.
3. Ir a `Inquilinos`.
4. Abrir el inquilino de prueba `Lucas Perez`.
5. Click en `Registrar actividad`.
6. En el selector de tipo elegir `WhatsApp`.
7. Completar asunto y cuerpo con un mensaje operacional de prueba.
8. Click en `Registrar actividad`.
9. Resultado esperado: la actividad queda registrada y el backend llama a WhatsApp Cloud API para enviar el mensaje.

Ruta directa validada para el formulario:

`https://rent.maese.com.ar/es/tenants/10000000-0000-0000-0000-000000000401/activities/new`

### Flujo B: Interesado

1. Abrir `https://rent.maese.com.ar/es/login`.
2. Iniciar sesion con `admin@rent.demo`.
3. Ir a `Interesados`.
4. Abrir un interesado de prueba.
5. Click en `Agregar actividad`.
6. En el selector de tipo elegir `WhatsApp`.
7. Completar asunto y cuerpo.
8. Click en `Agregar actividad`.
9. Resultado esperado: la actividad queda registrada y el backend llama a WhatsApp Cloud API para enviar el mensaje.

Ruta directa validada para el formulario:

`https://rent.maese.com.ar/es/interested/10000000-0000-0000-0000-000000000902/activities/new`

## Texto listo para pegar en App Review

### `whatsapp_business_messaging`

Rent is a real estate management application used by property administrators to manage tenants, prospects, leases, invoices and payments. We request WhatsApp Business messaging so authenticated administrators can send operational messages to tenants and prospects from CRM activity screens.

How to test:

1. Go to `https://rent.maese.com.ar/es/login`.
2. Log in with the reviewer credentials supplied in the private notes.
3. Go to `Inquilinos`.
4. Open the test tenant `Lucas Perez`.
5. Click `Registrar actividad`.
6. Select `WhatsApp` as the activity type.
7. Enter a short subject and body.
8. Submit the form.

Expected result:

The CRM activity is stored and Rent sends the message to the contact phone number through WhatsApp Cloud API. The same flow is available for prospects under `Interesados > Agregar actividad`.

Why this permission is necessary:

The product uses WhatsApp for transactional real estate communication: payment reminders, invoice/document notifications, visit follow-ups and lease renewal alerts. Messages are sent to existing contacts managed inside Rent and are not used for social login, ads or unrelated analytics.

### `whatsapp_business_management` si Meta lo requiere

Only include this permission if the App Review form requires it for the WhatsApp Business Account, phone number or webhook configuration.

Draft text:

Rent uses the WhatsApp Business Platform to send transactional real estate notifications from an authenticated CRM. This access is needed to operate the WhatsApp Business number connected to the app and to receive webhook callbacks for WhatsApp events.

## Evidencia a adjuntar

Grabar videos cortos, 30 a 90 segundos cada uno:

1. Login + flujo Inquilino + seleccion `WhatsApp` + envio.
2. Login + flujo Interesado + seleccion `WhatsApp` + envio.
3. Opcional: confirmar pago/factura y mostrar que el mensaje incluye documento PDF firmado.

Checklist para el video:

- Mostrar la URL `rent.maese.com.ar`.
- Mostrar que el usuario autenticado es Admin Demo.
- Mostrar el selector con `WhatsApp`.
- Mostrar el submit.
- Mostrar el resultado posterior: redireccion, actividad creada o respuesta exitosa.
- No mostrar tokens, secretos, variables de entorno ni datos reales.

## Compliance y configuracion

### Privacy Policy y Terms

Resultado inicial de produccion al ejecutar el plan:

- `https://rent.maese.com.ar/privacy` redirige a `/es/privacy` y devuelve 404.
- `https://rent.maese.com.ar/es/privacy` devuelve 404.
- `https://rent.maese.com.ar/terms` redirige a `/es/terms` y devuelve 404.
- `https://rent.maese.com.ar/es/terms` devuelve 404.

Accion tomada en el repo:

- Agregada ruta publica `frontend/src/app/[locale]/privacy/page.tsx`.
- Agregada ruta publica `frontend/src/app/[locale]/terms/page.tsx`.
- Agregada ruta publica `frontend/src/app/[locale]/data-deletion/page.tsx`.
- Actualizado footer para apuntar a `/{locale}/privacy` y `/{locale}/terms`.
- Actualizada la politica para declarar el uso de WhatsApp Business Platform/Meta y el proceso de eliminacion de datos.

Accion tomada en produccion:

- Cambios copiados a `/var/www/rent/current`.
- Build ejecutado en `/var/www/rent/current/frontend` con `npm run build`.
- Reiniciado `rent-frontend` con PM2.
- Verificado:
  - `https://rent.maese.com.ar/es/privacy` -> 200, `Privacy Policy`.
  - `https://rent.maese.com.ar/es/terms` -> 200, `Terms of Service`.
  - `https://rent.maese.com.ar/es/data-deletion` -> 200, `Data Deletion Instructions`.

Pendiente antes de enviar:

- Configurar esas URLs en App Settings de Meta.

### Data deletion

No se detecto Facebook Login ni almacenamiento de identidad de usuarios de Meta. Se agrego una pagina publica de instrucciones de eliminacion de datos:

`https://rent.maese.com.ar/es/data-deletion`

Para WhatsApp Cloud API, documentar que los datos tratados son telefono, mensaje, metadata de envio y documentos operativos del CRM.

### Webhook

Configurar callback URL:

`https://rent.maese.com.ar/api/whatsapp/webhook`

El endpoint existe; sin parametros de verificacion devuelve 400, lo esperado para una llamada directa sin `hub.mode`, `hub.verify_token` y `hub.challenge`.

## Pre-submit checklist

- [x] Produccion accesible.
- [x] Login demo validado.
- [x] Pantallas de Inquilinos, Interesados y Pagos validadas.
- [x] Formularios de actividad con opcion WhatsApp validados.
- [x] Alcance real identificado como WhatsApp Cloud API.
- [x] Textos de justificacion preparados.
- [x] Rutas locales de Privacy Policy y Terms agregadas al repo.
- [x] Ruta local de Data Deletion agregada al repo.
- [x] Desplegar Privacy Policy, Terms y Data Deletion a produccion.
- [x] Verificar URLs publicas de compliance en produccion.
- [ ] Confirmar Business Verification en Meta Business.
- [ ] Confirmar numero WhatsApp/test recipient valido para reviewer.
- [ ] Confirmar permisos exactos seleccionados en Meta UI.
- [ ] Grabar videos.
- [ ] Crear draft en App Review.
- [ ] Pegar credenciales en notas privadas de Meta, sin commitear password.
- [ ] Enviar submission.

## Referencias oficiales

- App Review: https://developers.facebook.com/docs/resp-plat-initiatives/appreview/
- App Review submission guide: https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide
- Access levels: https://developers.facebook.com/docs/graph-api/overview/access-levels/
- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api/
