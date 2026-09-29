# Renovación atómica y recuperable

Renovar un contrato activo o finalizado bloquea primero su inmueble y después el
contrato. El cierre del original activo, la disponibilidad del inmueble alquilado,
el nuevo borrador, su texto de plantilla y la constancia de operación se guardan
en una única transacción. Un fallo de fechas, relaciones, renderizado o constancia
revierte todos esos cambios. No se crea una cuenta ni un PDF para el borrador;
se conservan la cuenta y los documentos del contrato original.

`patch_lease_renew` transmite la clave estable de la aprobación. Un reintento con
la misma clave devuelve el resultado original, incluso tras confirmar, cerrar o
dar de baja el nuevo contrato. Parámetros diferentes con esa clave producen
conflicto. La recuperación requiere la migración 128 y respeta la autorización
por compañía y rol de la bandeja de aprobaciones.

El borrador recibe `previousLeaseId` y la versión del original más uno. Si el
original tiene un sucesor no eliminado, la renovación se rechaza y debe usarse
ese sucesor. El bloqueo compartido con la edición general impide crear a la vez
una revisión y una renovación del mismo original. No se reconstruyen vínculos ni
versiones de renovaciones históricas que carezcan de ellos.

## Términos y fechas

El DTO de renovación no introduce predeterminados de alta. HTTP e IA conservan
tipo, moneda, frecuencia/día, alertas y demás términos omitidos. Se heredan la
plantilla y el depósito, y se admiten cambios de términos, plantilla, número y
próxima fecha de ajuste. No se copia el número del contrato ni un ajuste pendiente
del período anterior. El borrador conserva el mismo inmueble y partes; el esquema
rechaza los campos de identidad que antes aceptaba sin aplicarlos. Los clientes
deben enviar únicamente los términos a renovar.

Las fechas persistidas se tratan como fechas civiles, incluyendo las cadenas que
devuelve PostgreSQL. Se mantiene el criterio de duración previo: si no se envían
fechas, el inicio es el fin anterior y el final preserva la duración en días. Por
eso un año bisiesto puede desplazar el día del aniversario. Sin fechas originales,
se utiliza un año desde el inicio mediante aritmética UTC. La política de fechas
contractuales reales sigue requiriendo la revisión prevista en el plan.

## Evidencia y límites

Pruebas PostgreSQL cubren pérdida de respuesta después del commit, recuperación
concurrente y posterior a baja, aislamiento, rollback de constancias y plantillas,
herencia HTTP/IA, fechas persistidas, sucesores concurrentes y revisión simultánea.
Se verifica que una renovación rechazada no cierre el original ni altere el
inmueble, y que no sustituya otro alquiler activo.

No agrega migraciones ni habilita proveedores o crons. Bajas y plantillas continúan
en [su recorrido recuperable](approved-lease-deletions-templates.md). La importación
continúa en [su recorrido recuperable](recoverable-contract-imports.md). Enmiendas,
la release y los demás requisitos del plan siguen pendientes.
