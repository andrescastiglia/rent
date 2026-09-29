# Ajustes de alquiler con evidencia persistente

La generación común de facturas calcula ajustes dentro de la transacción que
bloquea el contrato y guarda alquiler, calendario, borrador, cargo y colas de emisión.
La migración 126 agrega `invoices.rent_calculation`, `leases.inflation_index_lag_months`
y `leases.adjustment_anchor_date`. El cálculo no realiza llamadas a proveedores.
El antiguo calculador batch, sin consumidores desde la unificación, se retiró.

## Fechas y fórmulas

El importe vigente parte de `monthlyRent`. La base temporal es `lastAdjustmentDate`
o, para el primer ajuste, `startDate`. Se aplican los ajustes programados cuya fecha
es menor o igual al inicio del período facturado, en orden. Un atraso no mueve la
fecha contractual al día de ejecución. La frecuencia debe ser entera de 1 a 120 meses;
se rechazan calendarios incoherentes y atrasos superiores a 600 ajustes por generación.

La primera fecha programada se conserva como ancla. Los días 29–31 se limitan al
último día de meses cortos y recuperan su día original en meses posteriores, también
entre ejecuciones. Editar la fecha o frecuencia reinicia el ancla; guardar los mismos
valores la conserva. Las fechas civiles se guardan desde mediodía UTC para evitar
que TypeORM las desplace al día anterior en Argentina. La corrección también cubre
fechas de alta, edición e importación de contratos; no modifica datos históricos.

- ICL: alquiler anterior multiplicado por nivel de la fecha efectiva / nivel de la
  fecha base. Ambas observaciones diarias deben existir; no se usa el día anterior.
- IPC: cociente de niveles nacionales de los meses de referencia final e inicial.
- IGP-M: producto de `1 + variación mensual / 100`, desde el mes posterior a la base
  hasta el mes final inclusive. Cada mes debe existir y se admite deflación.
- Porcentaje fijo: factor `1 + porcentaje / 100` en cada fecha prevista.
- Importe fijo: suma del importe en cada fecha prevista.

Los factores se calculan con enteros y fracciones exactas; se redondea a centavos
al terminar cada ajuste, mitad hacia arriba. Se rechazan importes negativos, fuera
de rango o con precisión monetaria incompatible. Un nivel nunca se divide por una
variación mensual. La política de disminuciones para índices es simétrica: no se
aplica un piso implícito. Cláusulas contractuales diferentes requieren otro cálculo
explícito y no deben configurarse como esta política.

ICL sigue la metodología de cociente publicada por el
[BCRA](https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/tasmet.pdf).
El [INDEC](https://www.indec.gob.ar/ftp/cuadros/economia/como_usar_indice_precios_2022.pdf)
explica el uso de niveles del IPC para variaciones entre períodos. Esto implementa
fórmulas configuradas en contratos; no decide qué índice o cláusula corresponde.

## Rezago mensual explícito

Para IPC e IGP-M, `inflationIndexLagMonths` indica cuántos meses restar **tanto** al
mes base como al mes efectivo. Por ejemplo, contrato iniciado el 15 de enero y ajuste
el 15 de abril con rezago 1: base diciembre, final marzo. IPC usa esos dos niveles;
IGP-M usa enero, febrero y marzo. Cero refiere al mismo mes, si el dato está disponible.

El campo es nullable, sin default ni backfill; admite enteros 0–12. Un contrato
existente sin política explícita puede consultarse, pero no aplicar un ajuste mensual
hasta revisarla. El formulario requiere la elección para índices mensuales y conserva
un cero explícito; vacío no se convierte en cero. Se transporta por alta/edición,
revisión, renovación y contratos de API generados. No se elige automáticamente el
último mes publicado ni se cambia la política porque falte un dato.

## Evidencia y errores

Cada factura generada conserva un snapshot versión 1: alquiler inicial/final,
moneda, fecha del período y cada ajuste con fecha base/efectiva, ancla, frecuencia,
fórmula exacta y observaciones usadas (ID, revisión, valor, tipo, fuente, serie, URL
y momento de consulta). La base impide modificar ese snapshot, también en borradores.
El detalle autorizado de factura lo devuelve y la web permite revisar valores y fuentes.
Las facturas anteriores y manuales sin snapshot no muestran evidencia inventada.

La consulta usa las últimas revisiones visibles en una sola lectura. Una revisión
posterior del proveedor no cambia facturas guardadas. Recuperar por clave devuelve
la misma factura y evidencia. Los ajustes vencidos, calendario y evidencia se
revierten si falta una observación, falla la validación o no se completa la emisión.
La anulación de una factura no revierte automáticamente un ajuste contractual ya
aplicado: permanece su evidencia. Una nueva generación no repite el ajuste vigente.

Facturar un período anterior al último ajuste se rechaza incluso con
`applyAdjustment=false`, porque el alquiler actual no prueba el importe histórico.
La recuperación histórica/versionada continúa pendiente. Desactivar el ajuste en
una generación conserva el alquiler actual y lo registra sin pasos de ajuste.
No se prorratea un período que cruce una fecha de ajuste: la política aplica al
inicio del período y requiere calendarios contractuales compatibles.

## Verificación y operación

Pruebas unitarias verifican cocientes, porcentajes negativos, meses ausentes,
rezagos, centavos exactos, atrasos, días 31, anclas y fechas incoherentes. PostgreSQL
verifica generación HTTP, alcance de compañía, concurrencia, evidencia inmutable,
revisiones posteriores, reintentos y rollback. La emisión fallida conserva intactos
alquiler y calendario. La web verifica rezago vacío/cero y muestra evidencia guardada;
se comprobó el detalle en Chromium con respuestas HTTP locales.

Validación local: 1.434 pruebas backend (incluido el nuevo control de ancla),
276 E2E, 201 batch; 442 pruebas web verificadas entre la ejecución general y los
casos corregidos de formulario. Lint, tipos, build/OpenAPI y migración 126 repetida
se verifican antes de enviar el PR; CI confirma el commit completo.

Aplicar 125 y 126 antes del backend/cliente/batch compatibles. Revisar los calendarios,
rezagos y observaciones de los contratos reales antes de reactivar facturación.
Mantener los crons suspendidos durante esa revisión. No borrar snapshots ni volver
al cálculo antiguo en rollback; suspender generación y conservar las columnas.
BFA, Mercado Libre y Mercado Pago Payouts continúan deshabilitados y sin configurar.
