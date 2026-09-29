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
El intercambio OAuth y la renovación están conectados al almacén por compañía
(migración 115), sin intercambios reales durante la implementación. El protocolo
sigue la [autenticación oficial](https://developers.mercadolibre.com.ar/en_us/authentication-and-authorization)
y las pautas de [protección de tokens](https://developers.mercadolibre.com.ar/en_us/list-products/identity-and-access-management-oauth-and-tokens).

Configuración futura: `MERCADOLIBRE_ENABLED` (ausente/false),
`MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET`,
`MERCADOLIBRE_REDIRECT_URI` (URL HTTPS fija registrada en la aplicación) y
`MERCADOLIBRE_TOKEN_ENCRYPTION_KEY` (32 bytes aleatorios codificados en base64,
solo en secretos del servidor). No se carga `MERCADOLIBRE_ACCOUNTS_JSON`: los
clientes obtienen credenciales del almacén cifrado, sin alternativa de otra cuenta.

El administrador inicia `POST /integrations/mercadolibre/authorization`; recibe
una URL con estado aleatorio y PKCE S256. El retorno de autorización devuelve
`code` y `state` por `POST /integrations/mercadolibre/authorization/complete`
con la misma sesión de usuario y compañía. El estado vence en diez minutos,
se almacena como SHA-256 y solo se consume una vez; el verificador queda cifrado.
Los callbacks ajenos, vencidos o repetidos no llegan al proveedor.

Ambos tokens se guardan juntos con AES-256-GCM y contexto de compañía/vendedor.
El cliente reutiliza credenciales vigentes y renueva cuando quedan 60 segundos.
Antes de renovar persiste una intención y libera la transacción; otros workers
esperan mediante sus reintentos normales. La respuesta sustituye ambos tokens
mediante el ID de operación. Una respuesta incierta o un proceso interrumpido
exige reconectar; nunca se reutiliza automáticamente el token de renovación.
Un HTTP 401 invalida solo el token rechazado: una respuesta tardía no borra un
par más reciente. No se repite la solicitud del aviso automáticamente.
Un vendedor no puede vincularse a dos compañías y una reconexión conserva la
identidad del vendedor para proteger los avisos existentes.

`GET /integrations/mercadolibre/status` devuelve únicamente disponibilidad,
estado, vendedor y vencimiento. `DELETE /integrations/mercadolibre/connection`
elimina tokens locales, invalida estados pendientes y bloquea respuestas tardías,
incluso con la función deshabilitada. Esta desvinculación es local: la revocación
del permiso concedido en Mercado Libre se realiza desde su administración de
aplicaciones. Los eventos de conexión/renovación/desconexión conservan compañía,
actor cuando corresponde y fecha; no contienen credenciales. Todos los endpoints
exigen administrador.

La pantalla `/{locale}/settings/mercadolibre` permite consultar el estado,
iniciar autorización y confirmar la desvinculación local. El retorno fijo que
se registre en el futuro debe apuntar a `/{locale}/mercadolibre/callback` (por
ejemplo, `/es/mercadolibre/callback` bajo el dominio HTTPS de Rent). No se
configuró ninguna URL ni aplicación. El retorno exige la misma sesión de
administrador, borra código/estado de la URL y los conserva solo en memoria.
El usuario confirma el intercambio una sola vez; ante un error puede consultar
el estado o iniciar una autorización nueva, sin reenviar el código. Si la
sesión venció, debe ingresar y comenzar nuevamente. La pantalla permite reiniciar
intenciones antiguas; el servidor determina si su plazo de exclusión ya venció.
La función deshabilitada bloquea iniciar/completar autorizaciones, manteniendo
la consulta y la desvinculación local. No hay un interruptor de activación en la UI.

El callback usa `no-referrer`, `no-store` y `noindex`; se excluye de la
instrumentación de carga del navegador y de las transacciones de New Relic.
Antes de activar OAuth, la infraestructura que termine HTTPS también deberá
excluir o redactar `code`/`state` en los logs de la URL de retorno.

Conservar la clave de cifrado fuera de la base y de sus backups. Su sustitución
invalida los sobres anteriores y requiere reconectar las cuentas; no existe una
clave predeterminada ni recuperación a texto plano.
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
correspondiente. La persistencia y renovación OAuth ya usan
el almacén cifrado, con pruebas de concurrencia y aislamiento.
Las cuentas y flags continúan sin configurar; no se habilita publicación real.

### Catálogo y borradores

Las rutas administrativas `GET /portals/mercadolibre/catalog/categories/:id`,
`/states`, `/states/:id/cities` y `/cities/:id/neighborhoods` usan la conexión
cifrada de la compañía autenticada. No admiten una cuenta o token proporcionados
por el navegador, ni hacen llamadas si Mercado Libre está deshabilitado.
Las consultas son GET; la renovación OAuth conserva sus reglas de un solo uso.

El árbol comienza en `MLA1459` (Inmuebles de Argentina) y valida la raíz y el
último elemento del camino recibido. Las categorías intermedias devuelven
navegación; solo una categoría final habilitada devuelve atributos, unidades,
valores permitidos y tipos de publicación disponibles para ese vendedor.
Se excluyen tipos de otro país o con cupo cero. Las ubicaciones verifican país
Argentina e identidad de la provincia/ciudad solicitada. No se guarda un catálogo
estático ni se sustituyen datos inválidos del proveedor por opciones inventadas.

Fuentes: [categorías inmobiliarias](https://developers.mercadolibre.com.ar/productos-recibe-notificaciones/categorias-inmuebles),
[atributos](https://developers.mercadolibre.com.ar/atributos-inmuebles),
[tipos disponibles por vendedor](https://developers.mercadolibre.com.ar/en_us/listing-types-item-upgrades-tutorial)
y [ubicación](https://developers.mercadolibre.com.ar/es_ar/como-empezar/localizar-inmuebles).
La interfaz de alta/editor que consume este catálogo sigue pendiente.

Crear un borrador exige integración habilitada, compañía, propiedad de esa
compañía y datos completos validados localmente. Solo admite Mercado Libre.
Las altas concurrentes para la misma propiedad devuelven un borrador y conflictos
409 para las demás solicitudes, sin trabajos ni publicaciones automáticas.
Guardar un borrador existente sigue sin encolar. El cliente verifica nuevamente
que la categoría sea inmobiliaria, final y publicable antes de iniciar la
creación externa; un fallo en esta consulta no se confunde con una creación incierta.
La validación definitiva de atributos y reglas de publicación sigue en
`POST /items/validate` antes de `POST /items`.

### Editor de avisos

La ruta administrativa `/{locale}/properties/{propertyId}/portals/editor` permite
preparar un borrador con categorías, atributos/unidades, tipos de publicación y
ubicaciones obtenidos del catálogo de la compañía. Requiere integración habilitada
y conexión activa para consultar el catálogo o escribir. Sin ambas condiciones
muestra el bloqueo; no solicita datos al proveedor ni crea credenciales.

Guardar un borrador solo persiste sus datos. Publicar exige una acción separada,
resumen del aviso, aviso de posibles cargos y confirmación expresa. Actualizar un
aviso existente solo modifica título, precio, fotos, atributos y descripción;
conserva categoría, moneda, tipo, contacto y ubicación. Pausar, reactivar y cerrar
requieren confirmación. Cerrar no permite reactivar ese registro.

El editor vuelve a consultar los datos locales después de cada escritura y
muestra el estado de la cola, sin interpretar la aceptación como publicación
completada. Bloquea cambios mientras hay trabajos pendientes o una incidencia
`needs_review`. Una respuesta perdida bloquea nuevas escrituras hasta recargar
los datos guardados; no repite envíos automáticamente. Cambios sin guardar bloquean
las otras acciones. La recarga descarta esos cambios y consulta el estado persistido.

Validación: pruebas del modelo de formulario, endpoints internos, respuestas 204
y UI (deshabilitado/sin conexión, borradores, confirmación, estado incierto,
atributos/unidades, ubicación y operaciones pendientes). Verificación Chromium con
API interna simulada: alta de borrador y publicación confirmada/en cola, cero
solicitudes externas. No acredita disponibilidad ni habilitación de cuentas reales.

### Revisión de publicaciones

La ficha de la propiedad enlaza la vista administrativa
`/{locale}/properties/{propertyId}/portals`. Muestra la última operación y las
últimas 50 resoluciones, incluso deshabilitada. «Actualizar estado local» solo
lee Rent; «Consultar estado en Mercado Libre» encola un `refresh` por ID, sin
crear ni reactivar avisos. Desde esta vista se accede al editor de avisos.

`GET /portals/listings/:listingId/operations/:jobId/candidate/:externalId`
consulta el aviso mediante [GET /items/:id](https://developers.mercadolibre.com.ar/publica-productos)
y valida que pertenezca al vendedor de la compañía. Devuelve ID, título cuando
está disponible, vendedor, estado y enlace oficial. No vincula ni publica.
`POST /portals/listings/:listingId/operations/:jobId/resolve` exige administrador,
compañía, última operación `failed`/`needs_review` y motivo de 10 a 1000 caracteres:

- `link`: vuelve a verificar el ID fuera de la transacción y, bajo locks,
  revalida la incidencia. Vincula un aviso existente de una creación pendiente.
  El ID no puede estar asociado a otro registro, tampoco en otra compañía.
  Conserva el estado remoto; si faltaba descripción encola lectura/descripción,
  sin reactivar un aviso pausado ni volver a crearlo.
- `retry`: crea un nuevo trabajo conservando el original. Solo permite una
  creación sin ID cuando fue rechazada de forma definitiva; las demás
  operaciones se reintentan por su ID externo conocido.
- `confirm_not_created`: requiere `confirmedNoPublication: true`, declaración
  explícita de que el administrador revisó la cuenta y no encontró el aviso.
  Es evidencia humana, no una certificación automática de ausencia. Cierra la
  incidencia sin encolar; publicar nuevamente requiere otra solicitud expresa.
- `accept_remote`: consulta el ID ya vinculado y acepta su estado actual sin
  repetir el cambio fallido. Sirve para descartar una modificación pendiente.

La UI pide motivo y confirmación; vincular exige además consultar el candidato y
confirmar que corresponde a la propiedad. Los links se restringen al dominio
oficial y se abren con HTTPS/noopener/noreferrer. Ante errores se bloquean
nuevas escrituras hasta consultar el estado local, sin repetir resoluciones.

La migración 116 agrega `portal_publication_resolutions`, estado terminal
`resolved` e índice único del ID externo de Mercado Libre. Cada resolución
conserva actor, motivo, acción, incidencia original, metadatos remotos verificados
cuando corresponden y trabajo posterior. El registro y el trabajo nuevo se
confirman juntos; una resolución simultánea o una respuesta tardía no puede
aplicarse sobre una incidencia ya resuelta. El historial local se consulta en
`GET /portals/listings/:listingId/resolutions`. Todos los cambios y consultas al
proveedor siguen bloqueados mientras la integración esté deshabilitada.

Antes de aplicar 116, comprobar que no haya IDs externos de Mercado Libre
repetidos en `portal_listings`; el índice rechaza duplicados existentes sin
eliminarlos ni reasignarlos automáticamente. Pruebas: `portal-publications.e2e-spec.ts`
(concurrencia, dos compañías, ausencia manual, vinculación, respuesta tardía,
reintento por ID y aceptación remota), más pruebas de API y controles de la UI.

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
### Cola y conciliación de liquidaciones

`POST /settlements/:id/payout` exige administrador, compañía, confirmación expresa,
importe neto esperado en centavos y un único destino (correo o cuenta corriente).
Solo admite liquidaciones pendientes sin referencia de transferencia. La migración
117 guarda una solicitud inmutable por liquidación, con actor, destino e importe,
UUID de idempotencia y referencia estable `rent_settlement_<id>`. El cambio local
a `processing` y la solicitud se confirman juntos; las solicitudes simultáneas
iguales devuelven la misma orden. No hay HTTP dentro de esta transacción.

`POST /settlements/internal/process-payouts` requiere la credencial interna de
batch. Procesa hasta 25 órdenes con leases de dos minutos y fencing. Registra la
intención antes del POST y conserva los IDs aceptados antes de consultar el estado.
Un timeout, respuesta inválida, conflicto de idempotencia o caída después del envío
sin IDs persistidos queda en `needs_review`; no se reenvía automáticamente.
Solo se reintentan lecturas por IDs conocidos, hasta cinco fallos consecutivos.

Únicamente `success/accredited`, con identidad, referencia, importe, moneda y fecha
de actualización verificados, genera el movimiento `transfer` y completa la
liquidación en la misma transacción. Una aceptación o estado intermedio no paga.
Las lecturas repetidas no duplican asientos. Las acreditadas se consultan diariamente
para detectar devoluciones: `refunded/refunded` genera una única reversión del
movimiento previo y retira el estado pagado. Las observaciones antiguas se ignoran;
las contradictorias o parciales se envían a revisión sin inventar importes.
Estos movimientos documentan la transferencia de la liquidación; no reemplazan
la cuenta corriente del inquilino ni contabilizan comisiones del proveedor.

`GET /settlements/:id/payout` conserva el historial local aun deshabilitado,
sin exponer destinos ni credenciales. `POST /settlements/:id/payout/review` exige
motivo y confirmación y registra al actor. Permite vincular una creación incierta
solo después de verificar su transacción con el proveedor; reanudar una consulta
por IDs; o reintentar la misma solicitud/clave después de un rechazo HTTP definitivo
(400/401/403/422) o falta de configuración local. Un conflicto HTTP 409 nunca prueba
que la transferencia no exista. No permite cambiar el destino de una orden,
reenviar una creación incierta ni crear otra orden para la misma liquidación.

El CLI de reintentos invoca esta cola junto a las otras. Deshabilitada devuelve
cero procesados antes de consultar la base o el proveedor; incluir el endpoint
no habilita transferencias. `process-settlements` permanece suspendido y no debe
habilitarse durante un rollback. No se crearon cuentas ni credenciales.

Pruebas: `settlement-payouts.e2e-spec.ts`, con PostgreSQL real y transporte sustituido
explícitamente: concurrencia, rollback contable, dos compañías, respuestas perdidas,
leases vencidos, conciliación repetida, devolución completa y revisión de casos
parciales/contradictorios. CI incorpora la cobertura de todos los E2E del backend a
Sonar junto a las pruebas unitarias; conserva los umbrales y controles existentes.

Pendiente: generación durable de liquidaciones, recibos/notificaciones posteriores
al commit, interfaz administrativa y resolución contable de devoluciones parciales
o nuevas órdenes tras rechazos/reversiones verificados, gates y despliegue deshabilitado.

## Validación y rollback

Pruebas de protocolo con transporte simulado: `providers.spec.ts`.
Pruebas PostgreSQL aisladas: `bfa-stamps.e2e-spec.ts`, incluyendo cola deshabilitada,
aislamiento entre empresas, concurrencia, respuesta perdida y documentos alterados.
No constituyen evidencia de disponibilidad del proveedor ni validación de cuentas.

Las migraciones 113 a 117 conservan los datos y no encolan documentos ni avisos históricos. Para rollback,
conservar sus registros y mantener proveedores deshabilitados. Si se restaura
un artefacto anterior, restaurar también el CLI del mismo artefacto para evitar
invocar un endpoint que aún no exista. No borrar pruebas de sellado ni resoluciones;
conservar la restricción de IDs externos únicos y los trabajos `resolved` como terminales.
