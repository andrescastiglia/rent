# Enmiendas con aplicación automática

La aprobación programa la aplicación para `effectiveDate`, según el día civil de
Argentina. Si la fecha ya llegó, la aprobación intenta aplicarla en su misma
transacción. Las futuras se procesan desde `POST /leases/internal/process-amendments`,
protegido por `BATCH_COMMUNICATIONS_INTERNAL_TOKEN`, en el worker periódico de colas.
No se habilitan crons ni proveedores como parte de este cambio.

El recorrido es borrador → envío (`PATCH /amendments/:id/submit`) → aprobación o
rechazo. Administradores, personal y propietarios dentro de su alcance pueden
operar. Las cuatro herramientas mutables guardan constancias de ejecución en la
misma transacción: recuperar una aprobación devuelve su respuesta original; para
ver el estado actual se debe consultar la enmienda. La recuperación vuelve a
comprobar el alcance del propietario.

## Cambios admitidos

- Aumento/reducción: `newValues.monthlyRent` positivo, hasta dos decimales; acepta
  `rentAmount` como alias. Se verifica la dirección respecto del canon vigente.
- Prórroga: `newValues.endDate` debe extender la fecha final actual.
- Terminación anticipada: `newValues: {}`; la fecha efectiva pasa a ser la fecha
  final, se finaliza el contrato y se libera el inmueble de alquiler.
- Cláusulas: `termsAndConditions` y/o `specialClauses` completos.
- Garantía y otros cambios: texto completo de reemplazo en `specialClauses`.
  No existe un padrón de garantes ni se admiten IDs arbitrarios como sustituto.

No se cambian el texto confirmado, PDF original ni firmas. `previousValues`
aportado por el solicitante no se toma como evidencia del estado previo.

## Aplicación y facturación

`applicationStatus` distingue `none`, `pending`, `applied`, `error` y
`legacy_review`. Se registran `appliedAt`, último intento, error y un snapshot
con valores reales anteriores y posteriores. La migración 132 protege los términos
aprobados y la evidencia aplicada. Las aprobaciones históricas quedan en revisión:
el comportamiento anterior solo registraba la aprobación, sin aplicar valores.

El bloqueo respeta inmueble → contrato → enmiendas. Se procesan por fecha y número;
un error detiene las siguientes del mismo contrato. Una aprobación tardía no puede
sobrescribir una enmienda posterior ya aplicada. Contrato, inmueble y evidencia se
guardan atómicamente; un fallo de escritura revierte todos esos efectos. El worker
reintenta hasta 50 contratos por ejecución y prioriza los que llevan más tiempo sin
intentar, evitando que un error permanente monopolice el lote.

Los aumentos absolutos actualizan la base de renta y su fecha. Si existen ajustes
vencidos o facturas no anuladas que alcanzan la vigencia, se requiere revisión antes
de aplicar. No se recalculan facturas emitidas ni se crean créditos o prorrateos
silenciosamente. La generación, creación y emisión de facturas comprueban las
aprobaciones pendientes; tampoco permiten facturar más allá de una terminación
anticipada aplicada. El calendario de ajustes debe estar conciliado con la enmienda.

## Operación y pruebas

Las lecturas HTTP/IA exponen estado, error y auditoría. El worker devuelve cantidades
aplicadas y fallidas; el CLI informa fallo si requiere reintento/revisión. PostgreSQL
verifica recuperación, numeración concurrente, aprobación contra rechazo, workers
simultáneos, rollback, revisión histórica, roles/compañías, conflictos de facturación,
fecha futura, orden de aplicación y cada tipo de cambio admitido.

La resolución de aprobaciones históricas o inválidas continúa en
[la revisión administrativa auditada](amendment-review.md).
Pendientes del plan general: interfaz de alta/envío/aprobación/rechazo de enmiendas,
despliegue y verificación del worker en producción. Un rollback debe suspender el worker y
conservar los campos de auditoría; las enmiendas aplicadas no se revierten eliminando
columnas. Los cambios contractuales requieren una corrección explícita.
