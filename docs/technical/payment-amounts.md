# Importes y moneda de cobros

El servicio común valida alta, edición y confirmación por HTTP, IA y conciliación
bancaria. Importes con más de dos decimales, negativos, no finitos o fuera de la
precisión de base de datos se rechazan sin redondeo implícito. Cada concepto
admite importe no negativo y cantidad entera positiva; cargos y descuentos se
suman con enteros en centavos. El total debe ser positivo y coincidir exactamente
con el importe explícito, si se proporciona. No existe tolerancia de un centavo.

La precisión actual es de dos decimales: pago hasta 999.999.999.999,99 y precio
unitario de concepto hasta 9.999.999.999,99. Cantidades hasta 2.147.483.647, con
validación adicional del total. Esto refleja los tipos actuales de PostgreSQL,
sin ampliar la precisión ni introducir conversión de moneda.

Cambiar solo el importe conserva los conceptos y exige que sigan sumando ese
total. Para modificarlo se envían los conceptos corregidos, o una lista vacía
con el nuevo importe explícito. La cuenta de un pago no se puede cambiar mediante
PATCH. Su moneda debe coincidir con la cuenta; tampoco se confirma un cobro
contra facturas pendientes de otra moneda.

Antes de confirmar, se bloquea la cuenta y se vuelven a comprobar moneda,
importe y conceptos persistidos. Las imputaciones FIFO se calculan en centavos
y filtran por compañía/cuenta. Por ejemplo, 0,10 y 0,70 cancelan exactamente una
factura de 0,80 y la dejan pagada. Si una validación falla, la transacción revierte
movimientos, imputaciones, recibos, notas y outbox; no se guarda una constancia de
ejecución exitosa.

Los registros históricos incompatibles permanecen pendientes hasta su revisión
y corrección; no se cambia su moneda ni importe automáticamente. La corrección
no redefine la política de mora, reversión de cobros o períodos históricos:
esos requisitos continúan en el plan.

Evidencia: `payment-amount.spec.ts` cubre precisión, límites, descuentos,
cantidades e importes inconsistentes. `payment-flow.e2e-spec.ts` comprueba HTTP,
ediciones sin efectos parciales, registros históricos incompatibles, rollback
tras validar facturas y pagos fraccionarios sobre PostgreSQL real. Las pruebas
previas mantienen autorización, recuperación y conciliación bancaria.

No requiere migración nueva. Desplegar después del backend y esquema de
recuperación de cobros. Si se revierte esta validación, detener confirmaciones
de registros inconsistentes para evitar volver a admitirlos; preservar las
constancias ya registradas. BFA, Mercado Libre y Mercado Pago Payouts continúan
deshabilitados y los crons suspendidos.
