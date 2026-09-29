# Resumen del propietario

`GET /owners/me/summary` requiere rol propietario y obtiene el perfil por usuario y
compañía autenticados. No acepta seleccionar otro propietario por query. Devuelve
`propertiesCount`, `activeLeases`, `pendingSettlements`, `period`, `timeZone` y
`collectionsByCurrency`, con importes decimales como texto. OpenAPI genera el mismo
contrato para web y mobile; la web rechaza respuestas incompletas o montos numéricos.

Una consulta PostgreSQL toma todos los indicadores desde el mismo snapshot. Las
liquidaciones se vinculan por el propietario: su tabla no tiene `company_id`.
Los cobros se vinculan por imputación, factura, cuenta y contrato: `payments` no
tiene `lease_id` ni `paid_at`. El mes corresponde a la fecha de pago y al calendario
de `America/Argentina/Buenos_Aires`, independientemente de la zona del servidor.

El indicador muestra **cobros brutos imputados**, por moneda, no renta devengada ni
neto transferible. Suma imputaciones positivas, vigentes, de pagos completados con
imputaciones registradas. Valida compañía, propietario, inquilino, cuenta, moneda y
que la suma imputada no exceda el pago. Excluye pagos/facturas anulados o borrados,
imputaciones revertidas, registros inconsistentes y dinero sin imputar; no inventa
imputaciones para pagos históricos. Incluye cobros de contratos finalizados y
facturas de otros períodos cuando su pago pertenece al mes mostrado. No descuenta
comisiones, retenciones ni notas de crédito: el neto se consulta en liquidaciones.

Elimina el total ambiguo `totalIncomeCurrentMonth/currencyCode` y sus aliases. No
hay conversión ni suma entre monedas. Los clientes del endpoint deben desplegarse
con este contrato y recargarse los clientes anteriores; un frontend actualizado frente al backend anterior muestra un
error explícito, nunca ceros estimados. La lista de propiedades usa su endpoint
autorizado existente. Cambiar compañía oculta inmediatamente los datos previos y
descarta respuestas tardías. El reintento es una lectura explícita.

`owner-summary.e2e-spec.ts` verifica PostgreSQL real y HTTP: dos compañías, dos
propietarios locales, roles, aislamiento, importes exactos ARS/USD, saldos sin
imputar, fuentes inválidas, estados históricos y cambio de mes en Argentina.
Las pruebas web verifican importes mayores al entero seguro, error/reintento y
cambios de compañía. El transporte de proveedores rechaza llamadas inesperadas.

No requiere migraciones ni cuentas externas y no activa BFA, Mercado Libre o
Mercado Pago. Para rollback, conservar backend y frontend compatibles; no volver
a publicar la consulta anterior con columnas inexistentes.

Evidencia local: 237 E2E backend, 32 unitarias de propietarios y 423 pruebas web;
lint/tipos backend y frontend, tipos mobile, OpenAPI generado y compilación
standalone. Chromium en 390×844 y 1440×1000 comprobó error/reintento por teclado,
importes exactos y ausencia de desborde horizontal o llamadas externas. Axe no
detectó infracciones en el contenido probado; la validación WCAG integral continúa
pendiente en el plan general.
