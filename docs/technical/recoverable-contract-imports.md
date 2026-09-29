# Importación de contratos vigentes recuperable

`POST /contracts/import-current` y su alias `/leases/import-current` admiten
`idempotencyKey` UUID en el formulario multipart. La clave es opcional para
clientes anteriores; sin ella se mantiene la importación atómica, pero no la
recuperación de su respuesta. La interfaz web envía una clave estable para cada
intento y la reutiliza después de un fallo de red.

La migración 128 conserva el resultado original en la misma transacción que
contrato, archivo original, cuenta e inmueble. La identidad de la petición incluye
términos recibidos, SHA-256 de los bytes, tamaño, nombre y MIME del archivo. La
misma clave con datos diferentes devuelve 409; otra compañía no recupera el
resultado ajeno. Autenticación y permisos se verifican en cada petición.

Después de confirmar una importación, el reintento devuelve su respuesta original
incluso si el contrato fue finalizado o eliminado posteriormente. No reconvierte
el archivo ni crea otro documento o cuenta. La conversión de un intento nuevo
ocurre antes de bloquear inmueble y contrato, dentro de la transacción de la
constancia. El resultado completo también se lee antes del commit: un fallo de
esa lectura revierte la importación.

## Interfaz y reintentos

El navegador guarda únicamente la clave y una huella de los campos y del archivo,
separadas por compañía y usuario. No guarda el documento ni los términos en claro.
Tras una respuesta fallida conserva el intento. Recargar y seleccionar el mismo
archivo con los mismos datos recupera su clave pendiente; cambiar datos o archivo
identifica otro intento, sin sobrescribir el anterior. La información se elimina
al recibir una respuesta satisfactoria. Si el navegador no puede guardar una clave
nueva, no se envía la importación. Borrar el almacenamiento del navegador pierde
las claves pendientes; los demás clientes deben conservar las que generen.

El formulario bloquea envíos simultáneos mientras trabaja y conserva la selección
de la parte después de convertir un interesado, para que un reintento no repita
esa conversión. La conversión del interesado sigue siendo una operación separada
y no forma parte de la transacción del contrato.

## Evidencia y pendientes

Pruebas PostgreSQL cubren pérdida de respuesta después del commit, finalización y
baja posteriores, reintentos simultáneos en alquiler y venta, cambios de bytes o
términos, aislamiento, rechazo de claves inválidas y rollback de constancia o
lectura final. Las pruebas web ejercitan el envío multipart real del cliente con
respuesta perdida, clave reutilizada, ámbito, huellas, almacenamiento fallido y
limpieza tras éxito.

No agrega migraciones ni habilita proveedores o crons. Las importaciones antiguas
sin clave no se convierten en recuperables retrospectivamente. Enmiendas, otras
herramientas mutables, datos históricos y despliegue siguen pendientes.
