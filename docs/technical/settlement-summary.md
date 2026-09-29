# Lectura y resumen de liquidaciones

`GET /settlements/summary` devuelve `totals`, una lista agrupada por moneda y estado
registrado: `currencyCode`, `status`, `netAmount` decimal como texto, `count` y
`lastProcessedAt`. El importe es la suma del neto nominal de las liquidaciones en
ese grupo. No representa una conciliación de movimientos del proveedor ni convierte
monedas. Los estados pendiente, en proceso, completado, fallido y cancelado se
conservan separados. Los grupos sin registros se omiten; un alcance vacío devuelve
`{ "totals": [] }`.

La fecha es el máximo `processed_at` registrado. Si falta, permanece `null`; no se
infiere un procesamiento a partir de la fecha programada o de creación. PostgreSQL
suma decimales; backend y cliente conservan los importes como texto y no suman
monedas ni convierten los importes del resumen a números de punto flotante.

Listado y resumen comparten `ownerId`, `status`, `currency` y los límites inclusivos
`periodStart`/`periodEnd` en formato `YYYY-MM`. Rechazan meses inválidos o rangos
invertidos. El listado admite `limit` entero entre 1 y 500 y ordena con desempate
por ID; el resumen siempre agrega el alcance completo, sin límite de filas.
El adaptador web convierte su filtro de mes exacto `period` en ambos límites y ya
no envía un parámetro que el servidor ignoraba. No mezcla mes exacto y rango.

El alcance se obtiene de la compañía autenticada a través del propietario activo.
Un propietario siempre consulta su propio perfil, aunque solicite otro ID; uno
sin perfil recibe datos vacíos. Administradores filtran dentro de su compañía.
El listado permite personal con permiso del módulo. El resumen admite administradores
y propietarios tanto por HTTP como por IA; se corrigió la concesión adicional al
personal que existía solo en el catálogo IA. Las herramientas reutilizan los esquemas
del archivo DTO y explicitan moneda, estado y límites del resultado.

OpenAPI genera el contrato para web y mobile. La API web valida la respuesta y
rechaza el formato anterior, grupos duplicados e importes numéricos. Se retiran los
campos ambiguos `totalPending`, `totalCompleted`, `pendingAmount`, `completedAmount`
y sus contadores asociados; actualizar consumidores del resumen junto al backend.
El contrato del detalle/listado no cambia salvo sus filtros y límite efectivos.

Evidencia local: 239 E2E con PostgreSQL real, 1.395 unitarias backend y 428 pruebas
web; lint y tipos backend/frontend, tipos mobile, OpenAPI generado. Las pruebas
verifican dos compañías, propietarios, roles, cinco estados, monedas separadas,
`0.10 + 0.20 = "0.30"`, fechas desconocidas, filtros coincidentes, límite estable y
errores de validación. No se crean órdenes, movimientos ni solicitudes externas.

No requiere migraciones ni habilita proveedores. Mantener backend/clientes
compatibles en el despliegue y rollback; no restaurar el resumen que mezcla monedas.
La conciliación de devoluciones parciales y deuda posterior a transferencias sigue
pendiente en el plan general.
