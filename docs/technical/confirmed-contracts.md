# Confirmación de contratos y PDF recuperable

Confirmar un borrador sigue siendo una acción administrativa; no acredita firmas
de las partes ni solicita un sello BFA. Los proveedores permanecen deshabilitados.

## Transacción de confirmación

`POST /contracts/:id/confirm` y `PATCH /contracts/:id/activate` guardan en una
transacción el texto resuelto y su formato, la fecha de confirmación, el estado
activo, el reemplazo del alquiler anterior, el estado del inmueble, la cuenta del
inquilino cuando corresponde y el trabajo del PDF. Un fallo en cualquiera de esos
pasos revierte todos. No generan PDF, WhatsApp ni solicitudes a proveedores dentro
de esa transacción.

La operación bloquea primero el inmueble y luego el contrato, con compañía y
borrado lógico validados; vuelve a comprobar el inmueble después de adquirir el
bloqueo. Dos confirmaciones del mismo contrato producen un solo trabajo. Las
confirmaciones de revisiones distintas sobre el mismo inmueble se serializan y
conservan un único alquiler activo. Un índice parcial impide también que otros
escritores introduzcan alquileres activos duplicados. Antes de aplicar 121 revisar
agrupaciones de `leases` por compañía/inmueble con `status='active'`,
`contract_type='rental'` y `deleted_at IS NULL`: si hay más de una fila, resolverlas
con evidencia; la migración rechaza duplicados sin elegir ni borrar contratos.
La finalización usa el mismo orden de bloqueo.

La migración 121 conserva una solicitud por contrato en
`lease_contract_effects_outbox`: compañía, actor y snapshot inmutable del texto,
formato, idioma, fecha y versión. El contrato confirmado no puede volver a borrador
ni cambiar sus partes, inmueble, texto confirmado, fecha o versión; los cambios
requieren una revisión nueva. Esto impide que un guardado tardío de un borrador
sobrescriba una versión confirmada. Los contratos importados/históricos no reciben
trabajos automáticos ni se regeneran con datos actuales.

## Importación de contratos vigentes

`POST /contracts/import-current` interpreta el archivo antes de adquirir bloqueos.
Luego bloquea el inmueble por compañía y valida las partes y los contratos abiertos
con el mismo administrador de transacciones. Guarda juntos el contrato activo, los
bytes originales, la referencia del documento, el estado del inmueble y la cuenta
del inquilino. Un fallo, incluso después de persistir la cuenta, revierte todo.
Dos importaciones simultáneas del mismo alquiler o venta a la misma parte producen
un único contrato y un conflicto explícito, sin documentos ni cuentas huérfanos.
Un alquiler activo previo se conserva y bloquea otra importación.

El documento aprobado conserva SHA-256, versión, fecha y actor de importación;
las descargas directa y por enlace temporal verifican los bytes y rechazan alteraciones.
La consulta del enlace temporal incluye ahora los metadatos del hash; antes los
omitía y podía entregar contenido alterado. No se convierte el archivo
original a PDF ni se agrega trabajo de generación, firma, sello BFA o mensaje.
Las importaciones históricas conservan su comportamiento de lectura: este cambio
no hace backfill de hashes ni modifica sus archivos.

## Procesamiento y descarga

`POST /leases/internal/process-contracts` requiere
`x-batch-communications-token`. El CLI `retry-communications.cli.ts` lo ejecuta
junto a las otras colas antes de entregar comunicaciones. No configura un cron
nuevo ni cambia credenciales.

El worker toma hasta 25 trabajos con `FOR UPDATE SKIP LOCKED`. Guarda el PDF,
SHA-256, versión, fecha original, referencia en el contrato y estado completado
en una transacción. Si falla después de guardar el documento, revierte el archivo
y sus referencias; conserva el trabajo para reintentar. Tras cinco fallos pasa a
`dead_letter`. Los logs usan ID e intento, sin contenido contractual.

La fecha impresa procede de la confirmación original, no del reintento. El texto
se renderiza desde el snapshot, aunque hayan cambiado después los datos de las
partes. Las etiquetas del PDF están disponibles en español, inglés y portugués.

`GET /contracts/:id/contract-status` (también `/leases/:id/contract-status`)
requiere acceso al contrato y devuelve `queued`, `completed`, `dead_letter` o
`unavailable`, más disponibilidad local. Web administrativa y portal del inquilino
muestran esos estados y permiten actualizar mediante lecturas. La descarga verifica
respuesta HTTP antes de guardar bytes y presenta errores sin generar archivos falsos.

`GET /contracts/:id/contract` valida acceso, compañía y pertenencia del documento.
Para generaciones nuevas usa exclusivamente el documento vinculado al trabajo;
las históricas pueden consultar su último documento aprobado. Una carga pendiente
no se presenta como contrato confirmado. Las descargas HTTP e IA verifican el hash
de los PDF generados y rechazan contenido alterado. Ninguna lectura llama a BFA.

## Operación, evidencia y rollback

Revisar `status`, `attempts`, `error_code` y `next_attempt_at` en la cola. Antes de
recuperar un `dead_letter`, resolver la causa y comprobar que `document_id` siga
vacío; no borrar snapshots ni sobrescribir documentos completados. La recuperación
administrativa de versiones históricas sigue
pendiente en el plan general.

`lease-contract-effects.e2e-spec.ts` usa PostgreSQL real y HTTP autenticado: dos
compañías, roles, confirmación concurrente, reemplazos, rollback de cuenta/cola,
trabajadores simultáneos, fallo después de persistir PDF, reintento sin duplicados,
dead letters, hash alterado y descarga histórica. El transporte de proveedores
rechaza cualquier llamada inesperada. `lease-flow.e2e-spec.ts` conserva el recorrido
integral de contratos con limpieza de la nueva cola. La suite de efectos también
comprueba importaciones de alquiler/venta concurrentes, rollback después del archivo
y de la cuenta, bytes originales, hash alterado y partes de otra compañía. Las pruebas frontend cubren
estado, error de descarga, ausencia de reenvíos y cambio de compañía.

Validación visual: PDF de texto y HTML renderizados con Poppler; Chromium móvil y
escritorio verifica estados, descarga por teclado, bytes recibidos y error de
integridad sin llamadas externas. El análisis automatizado de accesibilidad de
la sección probada no reemplaza la validación completa pendiente del producto.

Evidencia local de esta entrega: 215 E2E, 1.392 unitarias backend y 419 pruebas
frontend; lint/tipos backend/frontend/mobile, compilación de producción y migración
repetida. La consulta productiva de solo lectura del 29/09/2026 encontró cero
grupos duplicados de alquileres activos. Repetirla al desplegar: no reserva el
estado de producción ni sustituye la validación del índice.

Validación de importación: 230 E2E y 1.392 unitarias backend. La regresión del enlace
temporal se reprodujo con HTTP 200 para bytes alterados; la corrección exige 409.
No se requieren nuevas migraciones ni configuración para esta importación.

Aplicar 121 antes de desplegar el backend/CLI compatibles. La migración es repetible,
no hace backfill y no activa proveedores. En rollback conservar tabla, vínculos, índice y
triggers; no volver a confirmar contratos con un artefacto que ignore la cola.
Preferir una corrección hacia adelante y mantener pausadas las mutaciones afectadas
hasta disponer de una versión compatible.
