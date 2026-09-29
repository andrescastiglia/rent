# Generación transaccional de facturas

El servicio backend usado por HTTP e IA crea el borrador y actualiza el alquiler
y calendario con el mismo `EntityManager`. Bloquea primero el contrato por
compañía, calcula el período y ajuste, guarda la factura y avanza
`last_billing_date`/`next_billing_date`. Si se solicita `issue=true`, reutiliza esa
transacción para cargo, comisión y cola de PDF; no abre una segunda conexión ni
deja un borrador/calendario adelantado si falla la emisión.

Dos generaciones del mismo período explícito sobre un contrato se serializan: la
segunda encuentra la factura existente y responde 409. Se consideran las facturas
no borradas ni canceladas/reintegradas. Cada solicitud sin fechas explícitas toma
el siguiente período del calendario ya confirmado; dos solicitudes sin clave pueden
avanzar dos períodos distintos. Las altas manuales siguen permitiendo conceptos adicionales en un
mismo período.
La creación explícita de un período histórico conserva las fechas más avanzadas
del calendario; no vuelve a programar meses ya recorridos.

## Recuperación de una solicitud

HTTP e IA aceptan `idempotencyKey`, un UUID generado por el cliente antes del primer
envío. La migración 123 guarda compañía, contrato, parámetros normalizados e ID de
factura en `invoice_generations`, dentro de la misma transacción que la factura,
el calendario, cargo, comisión y cola documental. Un fallo revierte también la clave.
El bloqueo por compañía/clave serializa peticiones concurrentes antes del bloqueo
del contrato. Un reenvío con la misma clave y opciones recupera el estado actual de
la factura, incluso si el calendario ya avanzó; no vuelve a calcular importes ni a
emitirla. No promete devolver una copia byte a byte de la respuesta inicial.

Cambiar contrato, fechas u opciones con una clave usada devuelve 409. Los valores
omitidos equivalen a `issue=false`, `applyLateFee=false` y `applyAdjustment=true`.
Los booleanos deben ser booleanos JSON: las cadenas `"false"`/`"true"` se rechazan
también en IA. Las claves UUID no distinguen mayúsculas de minúsculas.
La consulta exige la compañía autenticada y los roles administrativos habituales;
conocer una clave no concede acceso al documento de otra compañía.

Una factura cancelada, reintegrada o borrada conserva su clave y el reintento devuelve
409; nunca crea un reemplazo automáticamente. La asociación es inmutable y la FK
impide borrar físicamente la factura mientras exista el registro. No hay caducidad
ni limpieza automática de claves. No eliminar esos registros al revertir el backend.

La clave es opcional para conservar compatibilidad. Los clientes que no la mandan
siguen teniendo el comportamiento anterior y no deben reintentar automáticamente.
El cliente debe conservar la misma clave hasta resolver una respuesta perdida; crear
un UUID nuevo en cada reintento anula esta protección. Esto no resuelve por sí solo
la ventana entre aprobación de una acción IA y almacenamiento de su resultado.

## Numeración y calendario

Las series `INV` y `COM` usan bloqueos advisory de transacción separados por
compañía. La secuencia sale del mayor sufijo válido de toda esa compañía, incluyendo
documentos borrados y cancelados; no depende del propietario ni de la última fila
creada. Los formatos manuales ajenos a esas series no se interpretan como números.
Se conservan los índices únicos existentes. El bloqueo y la inserción pertenecen
a la misma transacción, y un rollback no reserva un número de un documento que
nunca llegó a persistirse. No se altera la numeración histórica ni se acredita
numeración fiscal.

Los períodos usan días de calendario, independientes de la zona horaria del
proceso. El mes actual usa Argentina; los vencimientos de día 29/30/31 se ajustan
al último día del mes y pasan al siguiente mes si preceden el inicio del período.
Las fechas personalizadas deben incluir inicio, fin y vencimiento válidos; un
período invertido se rechaza. Las frecuencias mensuales, bimestrales, trimestrales,
semestrales y anuales conservan su duración de calendario.

El ajuste consulta índices con fecha igual o anterior al período. Si corresponde
un ajuste por índice y no hay variación disponible, se rechaza la operación sin
avanzar fechas ni guardar alquileres parciales. Esto conserva la fórmula existente;
no sustituye la revisión general de conceptos, índices acumulados y mora auditada.

## Pruebas, límites y operación

Las pruebas con PostgreSQL cubren rollback de alquiler/calendario/factura/cargo/
comisión/cola, dos pedidos del mismo período, números concurrentes entre dos
propietarios de la misma compañía, números históricos borrados y alcance de
compañía. Las pruebas de calendario incluyen año bisiesto, vencimiento al final
del mes, trimestre y ejecución con distintas zonas horarias.

Validación local: 1.404 unitarias backend y regresión completa de 254 E2E;
después se validaron los 13 casos de facturación, incluido el nuevo caso que
impide retroceder el calendario (255 E2E cubiertos en total). Lint, tipos y
contrato OpenAPI comprobados. No se cambió la interfaz ni el formato del PDF.

Validación de claves: 1.404 unitarias y 261 E2E en regresión completa; después,
20 casos de facturación aprobados incluyendo el nuevo rechazo de una clave usada
en otro contrato (262 E2E cubiertos en total). Se verificaron cuatro solicitudes
automáticas concurrentes, parámetros cambiados, UUID en mayúsculas, alcance por
compañía/rol, recuperación por IA, booleanos inválidos, cancelación, reintegro,
borrado lógico, inmutabilidad y rollback de la clave ante un fallo de emisión.
La migración 123 se aplicó dos veces correctamente en PostgreSQL local. Lint,
tipos y generación OpenAPI aprobados. CI y despliegue se comprueban por separado.

Requiere las migraciones 122 y 123 antes del backend compatible; no agrega
credenciales ni activa procesos. Mantener los triggers, claves y documentos al revertir;
volver al escritor anterior reintroduce generación parcial y colisiones de números.

El batch delega ahora en el servicio común; ver [facturación programada](scheduled-billing.md)
para selección, claves por fecha, moneda, retenciones y pruebas del CLI real.
El cron sigue suspendido. También quedan
pendientes adopción de claves en todos los clientes, mora auditada, conceptos, recuperación
histórica y validación productiva.
