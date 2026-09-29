# Bajas y plantillas de contratos recuperables

`delete_lease_by_id`, `post_lease_templates` y `patch_lease_template_by_id` guardan
el cambio y su resultado aprobado en la misma transacción. La clave de ejecución
de la bandeja permite recuperar la respuesta original sin repetir el cambio,
incluso después de una baja lógica o modificación posterior. Cambiar los
parámetros bajo la misma clave produce conflicto. Requiere la migración 128.

## Bajas

La baja bloquea inmueble y contrato en el mismo orden que confirmaciones,
renovaciones y revisiones. No admite contratos activos ni originales con un
sucesor no eliminado. Así una confirmación no puede activar una copia que otro
proceso acaba de eliminar, y una renovación no queda vinculada a un original
eliminado concurrentemente. Si el contrato ya fue dado de baja, una aprobación
con su clave original recupera la confirmación; una nueva operación obtiene 404.

La baja es lógica y conserva cuentas, movimientos, documentos y trabajos de PDF.
Un trabajo pendiente sigue utilizando el snapshot confirmado y puede terminar
después de la baja. No se anulan cobros ni deudas, ni se libera un inmueble como
efecto de borrar un contrato. La finalización mantiene sus reglas anteriores.

HTTP y la herramienta IA devuelven la misma confirmación persistida. No se amplían
permisos: administradores y personal autorizado operan dentro de su compañía.

## Plantillas

El alta usa la transacción de la constancia. La edición bloquea la fila antes de
leer y modificar sus campos, para evitar que una actualización parcial sobrescriba
otra concurrente. Un cambio de nombre por HTTP o IA conserva formato y estado
de activación omitidos; el esquema PATCH ya no incorpora `plain_text` como valor
predeterminado. OpenAPI y los clientes exponen los campos opcionales.

La edición de la plantilla no cambia el texto ya confirmado ni su snapshot de PDF.
No se agregan borrado ni publicación automática de plantillas. La importación DOCX
de plantilla sigue siendo una conversión previa sin persistencia propia.

## Evidencia y pendientes

Las pruebas PostgreSQL pasan por la bandeja real con reautenticación, pérdida de
respuesta, recuperación concurrente, aislamiento por compañía/rol y rollback ante
fallos al guardar la constancia. Otros casos cubren PATCH HTML parcial, ediciones
simultáneas, baja contra confirmación/renovación, conservación contable y PDF
posterior a la baja. La misma clave en otra compañía no recupera una plantilla
ajena: un alta autorizada allí crea su propio registro.

La importación continúa en [su recorrido recuperable](recoverable-contract-imports.md).
Siguen pendientes enmiendas y otras herramientas mutables, datos históricos y despliegue. Este
avance no habilita proveedores ni crons.
