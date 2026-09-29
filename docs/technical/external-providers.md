# Proveedores externos deshabilitados

Decisión del usuario del 28/09/2026: implementar BFA, Mercado Libre y Mercado Pago,
pero no crear cuentas, configurar credenciales ni habilitar las funciones.
La configuración ausente equivale a deshabilitado, también durante las pruebas;
las pruebas de protocolo inyectan transporte simulado explícitamente.

## BFA: sellado e integridad

El [servicio BFA](https://bfa.ar/sello2) acredita existencia e integridad del
archivo mediante su hash. No certifica por sí solo la identidad o voluntad de
los firmantes. Por instrucción del usuario se usa únicamente BFA; no se agrega
un proveedor de certificados. El sellado no cambia un contrato a `SIGNED` ni lo
activa.

El protocolo implementado procede del
[código público TSA2](https://gitlab.bfa.ar/blockchain/tsa2/-/blob/master/api/src/index.js)
y su [verificador](https://gitlab.bfa.ar/blockchain/tsa2/-/blob/master/api/src/StamperWrapper.js):
`POST /stamp` recibe hashes SHA-256 y `GET /verify/:hash` devuelve sellos con
cuenta, bloque y fecha. El PDF permanece en Rent. Un HTTP exitoso de envío no
cuenta como confirmación de sellado.

`POST /digital-signatures/documents/:documentId/stamp` exige administrador,
compañía y un PDF persistido. Encola el digest en `document_bfa_stamps`
(migración 113). Las solicitudes concurrentes del mismo documento/hash comparten
un registro. La consulta histórica por GET está disponible aunque BFA esté
inhabilitado y rechaza IDs de otra compañía.

El cron existente llama a `POST /digital-signatures/internal/process-stamps`
con el token interno. Si BFA está deshabilitado, no consulta la cola ni realiza
tráfico externo. Al habilitarse en el futuro, verifica primero, persiste la
intención de envío antes del POST y consulta después hasta confirmar el sello.
Los fallos o caídas posteriores a esa intención nunca repiten automáticamente
el POST. Un claim tiene lease de dos minutos; el token de claim impide que un
worker anterior cierre el trabajo tomado por otro. Cada pasada procesa hasta
25 trabajos. La verificación se reintenta cada minuto, hasta 20 intentos o una
hora desde el envío. Los casos inciertos pasan a `needs_review`; los errores
anteriores al envío pueden terminar en `failed`.

Diagnóstico: consultar status, attempts, error_code, submitted_at y verified_at
en `document_bfa_stamps`. Los logs solo contienen ID e intento. Antes de resolver
un `needs_review`, comparar el digest almacenado con el documento y consultar
BFA. No reencolar envíos inciertos automáticamente. Un archivo cambiado no
hereda la prueba de su versión anterior.

La vista administrativa de cada contrato incluye «Sellado BFA». Consulta
`GET /digital-signatures/bfa/leases/:leaseId`, que devuelve únicamente metadatos
y constancias locales de los PDF persistidos del contrato, con alcance de compañía.
No consulta BFA ni devuelve los bytes del archivo. El servidor informa si está
habilitado; cuando está deshabilitado se pueden consultar constancias pero no
solicitar sellos. La interfaz permite actualizar el estado sin repetir envíos,
muestra hash/bloque/fecha y advierte cuando el archivo ya no coincide con la
versión de la constancia. Un resultado incierto exige consultar el estado antes
de permitir una nueva solicitud; los trabajos fallidos requieren revisión.

Configuración futura, no aplicada: `BFA_ENABLED` (ausente/false por defecto) y
`BFA_TSA_URL` (HTTPS, sin usuario, contraseña, query ni fragmento). El sitio de BFA
apunta actualmente a un servicio TSA2 de Buenos Aires; el endpoint deberá
seleccionarse y verificarse al configurar, sin asumir disponibilidad permanente.

## Mercado Libre

El cliente implementa validación y creación de avisos de Argentina, consulta,
actualización por ID, cambios active/paused/closed y descripción separada. Exige
imágenes HTTPS, ubicación y los campos de contacto actuales. Verifica el vendedor
configurado antes de crear y la propiedad de cada aviso antes de modificarlo.
Una respuesta incierta de creación se identifica como tal; no se reintenta
implícitamente para evitar anuncios duplicados.

Fuentes: [publicación inmobiliaria](https://developers.mercadolibre.com.ar/esa/publica-inmueble),
[atributos](https://developers.mercadolibre.com.ar/atributos-inmuebles),
[actualizaciones](https://developers.mercadolibre.com.ar/es_ar/publica-productos/actualiza-tus-publicaciones),
[OAuth](https://developers.mercadolibre.com.ar/en_us/authentication-and-authorization).
El cliente también implementa intercambio y renovación de tokens. El consumidor
debe persistir ambos tokens juntos y serializar su renovación; no se instaló
ninguna cuenta ni se realizó un intercambio real.

Configuración futura: `MERCADOLIBRE_ENABLED` (ausente/false),
`MERCADOLIBRE_ACCOUNTS_JSON` (mapa por UUID de compañía con accessToken y sellerId),
`MERCADOLIBRE_CLIENT_ID` y `MERCADOLIBRE_CLIENT_SECRET` para OAuth. El mapa solo
puede cargarse desde secretos del servidor; no se devuelve a clientes ni logs.
Los endpoints de publicación, pausa, actualización y eliminación encolan trabajo
en `portal_publication_outbox` (migración 114) después de validar compañía y
propiedad; desaparece el adaptador simulado. `listingData.item` contiene el aviso
inmobiliario validado y `listingData.description` el texto opcional. Las categorías,
atributos, ubicación y contacto deben completarse explícitamente; no se adivinan
IDs del catálogo. Editar un borrador valida y guarda sus datos sin publicar.
`PATCH /portals/listings/:id` actualiza título, precio, imágenes, atributos y
descripción de un aviso existente por ID; rechaza cambios de moneda, ubicación
u otros campos que este recorrido no envía al proveedor. `POST /portals/sync`
encola consultas de los avisos activos/pausados de la compañía, sin republicarlos.

`GET /portals/listings/:id/operation` devuelve disponibilidad y metadatos del último
trabajo. Una operación activa por aviso impide cambios concurrentes de su carga;
solicitudes idénticas comparten trabajo. El worker interno usa el token del cron,
procesa hasta 25 trabajos y no consulta la cola ni Mercado Libre mientras está
inhabilitado. Las creaciones persisten su intención antes del envío. Una respuesta
perdida o caída sin ID externo pasa a `needs_review`, nunca a republicación automática.
El ID recibido se guarda antes de procesar la descripción: reintentos posteriores
usan ese ID. La descripción se consulta antes de elegir POST o PUT, según la
[API oficial](https://developers.mercadolibre.com.ar/es_ar/metricas/descripcion-de-articulos).
Los estados locales reflejan la respuesta remota, sin marcar éxito al encolar.

Cada claim vence en dos minutos y su token protege contra respuestas tardías.
Actualizaciones y consultas fallidas esperan un minuto y, tras cinco intentos,
requieren revisión. El cron informa trabajos fallidos o pendientes de revisión.
No reencolar creaciones inciertas: comprobar primero el aviso en el vendedor
correspondiente. La resolución asistida de estas incidencias y la interfaz de
administración siguen pendientes, al igual que persistir/renovar tokens OAuth.
Las cuentas y flags continúan sin configurar; no se habilita publicación real.

## Mercado Pago Payouts

El cliente implementa creación de un payout para una liquidación y consulta de
su transacción. Conserva la clave de idempotencia suministrada, envía referencia
estable y compara moneda, importe y referencia al recibir respuestas. Una
aceptación `created` o `success/in_progress` no acredita fondos. Solo
`success/accredited` se considera acreditado.

Las solicitudes productivas se firman con Ed25519 sobre exactamente los bytes
JSON enviados, con firma base64 y `X-enforce-signature=true`. Sin clave válida
no sale la solicitud. Pruebas y producción se distinguen explícitamente mediante
`X-test-token`; nunca se asume el entorno por NODE_ENV.

Fuentes: [Payouts](https://www.mercadopago.com.ar/developers/es/docs/payouts/integration-configuration/money-transfers),
[estados](https://www.mercadopago.com.ar/developers/es/docs/payouts/resources/transaction-status-and-errors),
[firma productiva](https://www.mercadopago.com.ar/developers/es/docs/payouts/go-to-production).

Configuración futura: `MERCADOPAGO_PAYOUTS_ENABLED` (ausente/false) y
`MERCADOPAGO_PAYOUTS_ACCOUNTS_JSON` (mapa por compañía con accessToken, sandbox
explícito y signingPrivateKey para producción). No se generaron ni registraron
claves reales. El cliente admite un único destino: correo de Mercado Pago o datos
bancarios. Para destinos bancarios exige cuenta corriente, titular, número de
cuenta, banco de tres dígitos y documento del titular; la sucursal es opcional.
No deriva esos datos a partir de un alias ni admite cajas de ahorro. El protocolo
bancario está documentado también en la [versión Markdown oficial](https://www.mercadopago.com.ar/developers/es/docs/payouts/integration-configuration/money-transfers.md).
Pendiente: outbox/conciliación de liquidaciones y reflejo contable de
resultados/reversiones. `process-settlements` permanece
suspendido y no debe habilitarse durante un rollback.

## Validación y rollback

Pruebas de protocolo con transporte simulado: `providers.spec.ts`.
Pruebas PostgreSQL aisladas: `bfa-stamps.e2e-spec.ts`, incluyendo cola deshabilitada,
aislamiento entre empresas, concurrencia, respuesta perdida y documentos alterados.
No constituyen evidencia de disponibilidad del proveedor ni validación de cuentas.

Las migraciones 113 y 114 son aditivas y no encolan documentos ni avisos históricos. Para rollback,
conservar sus registros y mantener proveedores deshabilitados. Si se restaura
un artefacto anterior, restaurar también el CLI del mismo artefacto para evitar
invocar un endpoint que aún no exista. No borrar pruebas de sellado.
