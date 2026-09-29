# Emisión y PDF recuperable de facturas

HTTP, la herramienta IA y la generación mensual con `issue=true` usan la misma
transacción de emisión. Bloquean la factura por compañía, validan que siga en
borrador y guardan estado, fecha, cargo de cuenta corriente, comisión y trabajo de
PDF juntos. Un fallo al capturar el documento revierte también los asientos. Dos
emisiones concurrentes producen una emisión y un rechazo, sin cargos duplicados.

La migración 122 agrega `invoice_effects_outbox`: un trabajo por factura con datos
de impresión, idioma, plantilla y enlace de pago capturados al emitir. Solo copia
los campos necesarios de las partes; no conserva credenciales del usuario ni
otros datos de su cuenta. Un trigger impide cambiar ese snapshot o sustituir el
documento una vez vinculado. Otro impide modificar el contenido emitido o reabrir
la factura como borrador; admite cobros, cancelación y notas internas.

## Procesamiento

`POST /invoices/internal/process-documents` exige
`x-batch-communications-token`. El CLI de comunicaciones lo ejecuta antes de las
entregas, sin crear ni habilitar crons. Toma hasta 25 trabajos con
`FOR UPDATE SKIP LOCKED`, genera un PDF local y guarda sus bytes, SHA-256, vínculo
en la factura y trabajo completado en una transacción. Un fallo después de guardar
el archivo revierte los bytes y referencias; conserva el trabajo con espera
exponencial y lo pasa a `dead_letter` después de cinco intentos.

La plantilla y las partes proceden de la emisión original, aunque cambien después.
El campo `today` de las plantillas usa la fecha de emisión, no la del reintento.
Las fechas sin hora de PostgreSQL conservan su día en Argentina. Las etiquetas del
PDF estándar están traducidas en español, inglés y portugués. El pie de los
documentos estándar y personalizados ya no genera una página extra vacía.
El listado y detalle web también conservan el día de período/vencimiento,
independientemente de la zona horaria del navegador.

El PDF original se conserva también si la factura se paga o cancela antes de que
el procesador lo genere: documenta la emisión, no afirma el estado de cobro actual.
La pantalla sigue mostrando por separado el estado actual de la factura. Para
facturas cobrables, el worker prepara además una entrega consentida en la cola de
comunicaciones, dentro de la transacción documental; el envío externo sucede en
ese procesador. Ver [reglas de destinatario y consentimiento](scheduled-billing.md#documento-y-aviso).

## Lectura y recuperación

`GET /invoices/:id/document-status` aplica el mismo permiso por compañía y partes
que el detalle. Devuelve `queued`, `completed`, `dead_letter` o `unavailable`, más
disponibilidad local. El detalle web permite actualizar mediante GET y descargar
solo cuando está disponible. Distingue fallos de consulta/descarga, descarta
respuestas tardías al cambiar usuario, compañía o factura y no vuelve a emitir.
Las descargas existentes mantienen autorización, aprobación e integridad.

Los documentos históricos aprobados conservan su consulta. No hay backfill ni
regeneración automática: los documentos faltantes históricos se informan como no
disponibles. Revisar `attempts`, `error_code`, `next_attempt_at` y `document_id`
antes de recuperar un trabajo fallido; corregir su causa y conservar el snapshot.
No borrar un documento completado ni sobrescribir su hash para forzar un reintento.

## Evidencia y despliegue

`invoice-effects.e2e-spec.ts` prueba con PostgreSQL real y HTTP/IA: dos compañías,
roles, emisión concurrente, procesadores concurrentes, rollback contable, fallo
después de persistir bytes, recuperación, cinco fallos, snapshot después de cambiar
plantilla/partes y cancelar, aprobación retirada, inmutabilidad y credencial batch.
Las pruebas de interfaz cubren actualización por lectura, descarga fallida y cambio
de compañía. El transporte de proveedores rechaza cualquier llamada inesperada.

Validación local: 249 E2E, 1.396 unitarias backend y 438 pruebas web (incluidas las
regresiones de fecha agregadas), lint/tipos y compilación web de producción. Se
aplicó 122 dos veces. PDF estándar y personalizado con QR revisados con Poppler;
Chromium a 390 y 1440 px valida teclado, estados, bytes descargados y error 409,
sin mutaciones de negocio, llamadas externas ni desbordamiento horizontal. El
análisis automatizado de accesibilidad del contenido no reemplaza la validación
integral de WCAG pendiente en el plan.

Aplicar 122 antes del backend y CLI compatibles; es repetible y no habilita
proveedores. En rollback conservar tabla, snapshots, vínculos y triggers. No
desplegar un emisor antiguo que ignore la cola; preferir corrección hacia adelante
y suspender emisión/procesamiento mientras sea necesario.

El servicio HTTP/IA ahora incluye creación del borrador, calendario y numeración
en la [transacción de generación](invoice-generation.md). Pendientes del plan
general: adopción de claves en los demás clientes, conceptos
y mora auditados, recuperación histórica y emisión fiscal. Esta entrega no
acredita esos recorridos ni una firma digital o sello BFA.
