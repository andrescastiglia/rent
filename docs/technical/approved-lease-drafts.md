# Altas y revisiones de contratos atómicas

El alta de un contrato y su texto de plantilla ahora se guardan juntos. La edición
general del borrador y la creación de una revisión de un contrato no borrador
también usan una única transacción para el registro, la validación de relaciones,
el texto resuelto y el resultado original. Un fallo de renderizado o de la
constancia aprobada revierte todo el cambio; no deja contratos parciales.

`post_leases` y `patch_lease_by_id` transmiten la clave estable de aprobación a la
constancia de dominio de la migración 128. Tras una respuesta perdida, el reintento
autorizado devuelve el resultado original, incluso después de una confirmación,
cierre o baja posterior. No crea otra alta o revisión. Cambiar parámetros con la
misma clave produce conflicto. La edición de un contrato activo conserva el
original y produce una revisión en borrador; si ya existe una revisión abierta
del mismo original, se rechaza otra y debe editarse la existente.

El alta bloquea el inmueble antes de comprobar contratos abiertos, de modo que
dos altas concurrentes para el mismo inmueble y parte no generan dos borradores.
La edición bloquea los inmuebles original y destino en orden estable por UUID
normalizado, y luego el contrato. Comparte ese orden con la confirmación. Una
confirmación concurrente no puede ser sobrescrita por una copia atrasada del
borrador: una edición posterior sigue el recorrido de revisión.

Los PATCH HTTP e IA ya no heredan los valores predeterminados de creación para
tipo de contrato, moneda, frecuencia/día de pago y alertas de renovación. Editar
solo notas conserva esos términos, tanto en alquileres como en ventas. La
validación de fechas admite el formato civil que PostgreSQL devuelve, sin asumir
que las columnas `date` sean objetos JavaScript `Date`.
Al guardar se descartan las relaciones previamente cargadas de inmueble, partes
y plantilla, para que TypeORM no sobrescriba sus nuevos IDs con la relación anterior.
La respuesta y el renderizado vuelven a leer las relaciones actuales en la transacción.
El renderizado explícito también reemplaza la relación de plantilla cargada,
para persistir el ID seleccionado junto con su nombre y texto.

## Validación y despliegue

Pruebas PostgreSQL recorren la bandeja real con reautenticación, pérdida de
respuesta, cambios posteriores, recuperación concurrente y aislamiento por
compañía/rol. Cubren rollback de altas/ediciones/revisiones, render fallido,
creación concurrente, recuperación de la revisión original, rechazo de otra
revisión abierta, PATCH parcial por HTTP/IA y edición simultánea con confirmación.
Los cambios cruzados de inmueble incluyen UUID en mayúsculas para comprobar el
orden común de bloqueo.

No agrega una migración; requiere 128 para las constancias aprobadas. Actualizar
el backend y los clientes con el esquema PATCH regenerado. Las aprobaciones
históricas sin garantía mantienen su revisión manual. No se reescriben revisiones
históricas duplicadas ni se normalizan automáticamente ramas de versiones antiguas.

La renovación continúa en [su recorrido atómico](approved-lease-renewals.md).
Las bajas y modificaciones de plantillas continúan en [su recorrido recuperable](approved-lease-deletions-templates.md).
La importación continúa en [su recorrido recuperable](recoverable-contract-imports.md).
Siguen pendientes enmiendas,
además de otras herramientas mutables. La política completa de cambios de partes
o inmueble y las versiones históricas requieren su revisión de producto; este
avance asegura la transacción y la recuperación de estos dos recorridos. No
habilita crons ni proveedores externos.
