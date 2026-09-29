# Historial de observaciones de inflación

La migración 125 agrega `inflation_observations`. El comando batch `sync-indices`
guarda allí observaciones tipadas y revisiones inmutables, con fuente, identificador
de serie, URL y momento de inicio de la consulta. No confunde ese momento con la
fecha de publicación, que estas respuestas no acreditan.

- ICL: serie BCRA 40, nivel diario, desde 2020-06-30. Se conserva cada fecha real;
  no se reduce al último valor del mes ni se lo fecha como primer día.
- IPC: serie nacional `148.3_INIVELNAL_DICI_M_26` de INDEC vía datos.gob.ar, nivel
  mensual, base diciembre de 2016.
- IGP-M: serie SGS 189 de FGV vía BCB, variación porcentual mensual. Se admite
  deflación; el valor no es un nivel de índice para dividir por otro mes.

Las fechas se interpretan en UTC como fechas civiles. Se rechazan fechas imposibles,
valores vacíos/no finitos, niveles no positivos, porcentajes menores o iguales a
-100, datos fuera del rango solicitado y respuestas truncadas conocidas. IPC e
IGP-M solo pueden persistir con fecha del primer día del mes. No se admite cambiar
la identidad de las series mediante las variables históricas de configuración.

## Sincronización y recuperación

`sync-indices --index all` procesa las tres fuentes de forma independiente.
`--index icl|ipc|igp_m` selecciona una; `--from-date YYYY-MM-DD` y
`--to-date YYYY-MM-DD` permiten repetir un rango explícito. En índices mensuales
se incluye el mes de inicio completo. Sin rango se consulta desde el inicio de la
serie o desde 62 días antes de la última observación del nuevo historial.

ICL se consulta en ventanas de 90 días y los índices mensuales en ventanas de un
año. Se guardan todos los resultados de una fuente juntos, después de completar
sus ventanas: un fallo de red o validación no avanza parcialmente su historial.
Un fallo en una fuente permite completar las demás, registra `partial_failure`
y devuelve código de salida 1. Las métricas cuentan esa ejecución como fallida.

Repetir idéntico valor y procedencia no crea otra revisión. Un cambio agrega una
revisión y conserva la anterior. El bloqueo transaccional por índice serializa
escrituras concurrentes. Una consulta iniciada antes de la revisión ya persistida
no la reemplaza al terminar tarde. Este control ordena consultas locales; no
pretende conocer versiones remotas ni una fecha oficial de publicación.

La superposición incremental no descubre correcciones o huecos anteriores a su
rango. Para revisarlos se debe ejecutar un rango explícito. La ingestión no rellena
observaciones ausentes ni afirma completitud de un calendario que la fuente no
entregó; el cálculo debe exigir las observaciones necesarias para cada contrato.

## Límite de esta entrega

`inflation_indices` queda intacta y deja de ser el destino de este comando. Sus
antiguos valores mensuales de ICL no se copian como si fueran observaciones diarias.
El [cálculo común con evidencia](rent-adjustments.md) ya consume el historial y
reemplaza el ajuste mensual anterior; el antiguo calculador batch fue retirado.
Antes de habilitar facturación o sincronización productiva hay que revisar las
observaciones, calendarios y rezagos explícitos de los contratos reales. No se
recalculan facturas históricas. Los crons permanecen suspendidos.

La metodología del BCRA usa el cociente entre ICL de fecha de ajuste y de fecha
inicial o del último ajuste. Los porcentajes mensuales de IGP-M requieren
acumulación multiplicativa; no se sustituyen por cocientes entre porcentajes.
Fuentes oficiales consultadas:
[BCRA, metodología](https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/tasmet.pdf),
[BCRA, API v4](https://www.bcra.gob.ar/archivos/Catalogo/Content/files/pdf/principales-variables-v4.pdf),
[INDEC, IPC](https://www.indec.gob.ar/Nivel4/Tema/3/5/31),
[BCB, serie 189](https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados?formato=json).

## Verificación y operación

Las pruebas unitarias cubren parsing, tipos de valores, identidad de serie,
rangos, límites de respuesta, ventanas y fallos entre ventanas.
`batch/scripts/verify-index-ingestion.cjs` ejecuta el CLI real con proveedores HTTP
locales y PostgreSQL: fechas diarias, deflación, reintentos, revisiones, errores
parciales, escrituras concurrentes, consulta obsoleta, inmutabilidad y rollback.
Solo admite `NODE_ENV=test` y una base cuyo nombre contenga `test`; elimina sus
fixtures. CI ejecuta esta verificación. Validación local: 218 pruebas batch con
cobertura, lint, tipos, formato y build; migración 125 aplicada dos veces y CLI
con PostgreSQL aprobado. Las consultas públicas de enero–marzo de
2025 comprobaron las estructuras actuales de BCRA, datos.gob.ar y BCB, sin
persistirlas ni configurar cuentas.

Aplicar 125 antes del batch compatible. Mantener la tabla y sus revisiones en
rollback; suspender el job, sin volver a sobrescribir datos con el sincronizador
anterior. No se habilita ni configura BFA, Mercado Libre o Mercado Pago.
