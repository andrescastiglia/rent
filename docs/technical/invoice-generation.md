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
el siguiente período del calendario ya confirmado; dos solicitudes pueden avanzar
dos períodos distintos. Esto no equivale a idempotencia de solicitud: la recuperación
de una respuesta perdida aún requiere una clave durable antes de habilitar reenvíos
automáticos. Las altas manuales siguen permitiendo conceptos adicionales en un
mismo período.
La creación explícita de un período histórico conserva las fechas más avanzadas
del calendario; no vuelve a programar meses ya recorridos.

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

No hay migración ni configuración nueva. Requiere la migración 122 y el backend
compatible con la cola de PDF. Mantener los triggers y documentos al revertir;
volver al escritor anterior reintroduce generación parcial y colisiones de números.

El batch conserva por ahora un escritor independiente en `billing.service.ts` e
`invoice.service.ts`, con cálculos de conversión/retenciones, PDF y notificación
separados. Su unificación con el servicio común sigue pendiente y el cron no se
habilita. La transacción descrita aquí prueba HTTP/IA, no ese batch. También quedan
pendientes idempotencia por solicitud, mora auditada, conceptos, recuperación
histórica y validación productiva.
