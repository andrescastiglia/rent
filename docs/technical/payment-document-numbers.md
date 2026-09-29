# Numeración persistente de recibos y notas de crédito

Los recibos de cobros (`REC-YYYYMM-NNNN`) y las notas de crédito
(`NC-YYYYMM-NNNN`) ahora asignan su número dentro de la transacción que guarda
el documento y la contabilidad. La migración 131 instala un contador por tipo,
la función de asignación y los triggers que registran las importaciones.

El algoritmo anterior consultaba el último registro por fecha. Un número manual,
una fecha histórica fuera de orden o la eliminación del último documento podían
repetir una numeración existente y bloquear la confirmación de un cobro. El nuevo
contador se inicializa con el mayor sufijo válido de todo el historial, incluyendo
notas anuladas o con baja lógica. Un número importado posteriormente actualiza el
contador en la misma transacción. Formatos ajenos a `REC/NC-YYYYMM-dígitos` se
conservan y no reinician la secuencia.

Se conservan el formato y la unicidad global existente de cada tipo documental.
El sufijo continúa entre meses; el mes del prefijo se determina en Argentina.
El cálculo usa `numeric` de PostgreSQL y devuelve texto, sin conversiones a números
JavaScript. Si el número excede la capacidad actual de 50 caracteres, se rechaza
la operación con un error explícito y se revierte también su contador.

La asignación y las importaciones comparten el bloqueo transaccional existente.
Los números de documentos persistidos no se renumeran. El contador no retrocede
ni se elimina por DELETE/TRUNCATE; borrar un documento no libera su número.
Un rollback contable revierte también la asignación aún no publicada. No se
promete una secuencia sin saltos ni se deben borrar contadores durante tareas de
limpieza: un número reservado en una transacción confirmada queda consumido.

## Migración y operación

Aplicar 131 antes del backend. La migración bloquea escrituras de recibos y notas
durante la lectura inicial, conserva los números y montos existentes, y puede
repetirse sin reducir contadores ya avanzados. Coordinar la ventana de migración
según el volumen del historial. No ejecutar simultáneamente tareas que eliminen
o reconstruyan estas tablas.

Los namespaces de bloqueo se conservan durante el cambio de versión, pero el
algoritmo anterior sigue siendo vulnerable a colisiones; retirar esos escritores
al terminar el despliegue. Para rollback, conservar contadores, función y triggers
y suspender la generación con la versión antigua hasta revisar la causa. No
reiniciar contadores como mecanismo de recuperación.

Las pruebas PostgreSQL ejecutan la migración real en esquemas aislados y cubren
historial fuera de orden, baja/anulación, imports posteriores, precisión superior
a `Number.MAX_SAFE_INTEGER`, concurrencia, rollback, eliminación de documentos,
repetición de migración, inmutabilidad, capacidad máxima y cambio de mes en
Argentina. El flujo de cobros usa el asignador dentro de su transacción habitual.

Este cambio abarca recibos de alquiler y notas de crédito. Facturas, comisiones y
recibos de ventas mantienen sus asignadores actuales y requieren su propia
verificación. No cambia la política de mora, saldos históricos ni habilita crons
o proveedores externos.
