# Historias de Usuario - Refactor de Personas, Contratos y Documentos

## 1. Modelo de Personas y Propiedades

**ID: US-MOD-01 - Eliminación de Leasing**
*Como* administrador,
*quiero* eliminar la opción de leasing de todo el sistema,
*para* operar solo con alquiler y compra/venta.

**Criterios de aceptación**
- No se muestran menús, filtros, formularios ni etapas de leasing.
- No se permite crear nuevos registros de leasing por API o UI.
- Los flujos activos quedan limitados a alquiler y compra/venta.

**ID: US-MOD-02 - Prospecto como Persona Unificada**
*Como* agente comercial,
*quiero* que un prospecto sea una persona única,
*para* poder clasificarla como propietario, inquilino o comprador según su evolución.

**Criterios de aceptación**
- Existe una entidad persona/prospecto reutilizable.
- La misma persona puede asumir uno o más roles (propietario, inquilino, comprador).
- No se duplican datos personales al cambiar de rol.

**ID: US-MOD-03 - Propiedades Cargadas por Propietario**
*Como* administrador,
*quiero* cargar y consultar propiedades por propietario,
*para* mantener correctamente la cartera asignada a cada dueño.

**Criterios de aceptación**
- En alta/edición de propiedad se requiere o permite seleccionar propietario.
- Se pueden listar y filtrar propiedades por propietario.
- La ficha del propietario muestra sus propiedades asociadas.

**ID: US-MOD-04 - Etapa Inicial Interesados y Conversión**
*Como* agente comercial,
*quiero* que las etapas iniciales de inquilino/comprador sean "interesado",
*para* convertirlos luego formalmente a inquilino o comprador.

**Criterios de aceptación**
- La etapa inicial disponible es `interesado`.
- Desde un interesado se puede ejecutar conversión a inquilino o comprador.
- Se conserva historial de etapa y fecha de conversión.

**ID: US-MOD-05 - Reserva de Propiedad Vinculada a Persona**
*Como* agente,
*quiero* marcar una propiedad como reservada desde actividades de inquilino o comprador,
*para* relacionar explícitamente la reserva entre persona y propiedad.

**Criterios de aceptación**
- Existe acción de "reservar" en actividades de inquilino, comprador y propiedad.
- La reserva guarda vínculo persona-propiedad y estado visible.
- La reserva aparece en la línea de tiempo de ambas entidades.

## 2. Actividades y Panel

**ID: US-ACT-01 - Actividades para Propietarios**
*Como* agente,
*quiero* registrar actividades para propietarios como ya se hace con inquilinos y compradores,
*para* tener trazabilidad de gestión también del lado del dueño.

**Criterios de aceptación**
- Se pueden crear/editar/finalizar actividades de propietario.
- La actividad permite seleccionar propiedad asociada de forma opcional.
- Las actividades quedan en la línea de tiempo del propietario.

**ID: US-ACT-02 - Panel con Actividades de Personas**
*Como* usuario operativo,
*quiero* ver en el panel actividades de inquilinos, compradores y propietarios,
*para* priorizar tareas vencidas y del día.

**Criterios de aceptación**
- Se elimina el bloque de actividad reciente actual.
- Se muestran primero actividades vencidas no finalizadas.
- Debajo se muestran actividades del día actual.
- Cada actividad puede marcarse como finalizada o editarse para agregar comentario.

## 3. Contratos

**ID: US-CON-01 - Creación de Contrato desde Propiedad o Persona**
*Como* administrador,
*quiero* crear contratos desde la propiedad o desde la persona (inquilino/comprador),
*para* soportar ambos flujos operativos sin fricción.

**Criterios de aceptación**
- Desde propiedad: se puede seleccionar inquilino o comprador para crear contrato.
- Desde inquilino/comprador: se puede seleccionar propiedad para crear contrato.
- En ambos casos se genera el mismo tipo de contrato consistente.

**ID: US-CON-02 - Eliminación de ID de Unidad**
*Como* administrador,
*quiero* quitar el campo `unitId` de contratos,
*para* simplificar el modelo contractual.

**Criterios de aceptación**
- El campo `unitId` no existe en DTOs, entidad, UI ni API de contratos.
- No se exige ni valida `unitId` en alta o edición.

**ID: US-CON-03 - Estados de Contrato Acotados**
*Como* administrador,
*quiero* que los contratos solo tengan estados borrador, activo y finalizado,
*para* estandarizar el ciclo de vida contractual.

**Criterios de aceptación**
- Los únicos estados permitidos son `borrador`, `activo` y `finalizado`.
- No se aceptan ni muestran otros estados en API o UI.

**ID: US-CON-04 - Reglas por Tipo de Contrato**
*Como* administrador,
*quiero* que los campos del contrato dependan del tipo (alquiler o compra/venta),
*para* evitar datos inválidos y reflejar reglas del negocio.

**Criterios de aceptación**
- Contrato de alquiler: tiene fecha inicio/fin, condiciones de facturación, mora y ajustes.
- Contrato de compra/venta: no muestra ni persiste fecha fin/inicio de alquiler, facturación, mora ni ajustes.
- Contrato de compra/venta: incluye valor fiscal.
- Contrato de alquiler: no incluye valor fiscal.

## 4. Inquilinos, Pagos y Cuenta Corriente

**ID: US-PAY-01 - Acciones de Contrato y Cobro en Inquilinos**
*Como* cobrador,
*quiero* desde la ficha de inquilino ver contrato, registrar pagos y consultar pagos descendentes,
*para* operar cobranzas desde una única pantalla.

**Criterios de aceptación**
- En inquilinos existe acceso a ver contrato.
- Se puede registrar pago desde la ficha del inquilino.
- Se muestra listado de pagos ordenado por fecha descendente.

**ID: US-PAY-02 - Cálculo de Deuda y Mora al Registrar Pago**
*Como* sistema,
*quiero* calcular automáticamente deuda y posibles moras al registrar un pago de inquilino,
*para* mantener correcta la cuenta corriente y el saldo pendiente.

**Criterios de aceptación**
- El cálculo toma facturación emitida y movimientos de cuenta corriente.
- Si corresponde, se calcula mora según reglas vigentes del contrato.
- El resultado actualiza deuda total, saldo de factura y estado de cuenta.

**ID: US-PAY-03 - Nota de Crédito por Mora al Cancelar Factura**
*Como* administrador,
*quiero* generar nota de crédito asociada cuando se cancele una factura con mora,
*para* reflejar correctamente la compensación de mora en la factura relacionada.

**Criterios de aceptación**
- Al cancelar factura con mora se puede emitir nota de crédito vinculada.
- La nota de crédito referencia la factura origen.
- El saldo final de cuenta corriente refleja el ajuste aplicado.

## 5. Documentos PDF y Consulta

**ID: US-PDF-01 - PDFs de Recibos, Facturas y Notas de Crédito**
*Como* usuario operativo,
*quiero* generar PDF de salida para recibos, facturas y notas de crédito,
*para* contar con comprobantes formales descargables.

**Criterios de aceptación**
- Cada tipo documental genera PDF con formato consistente.
- El PDF queda disponible inmediatamente luego de su emisión.

**ID: US-PDF-02 - Persistencia de PDFs de Facturas por Batch**
*Como* sistema batch,
*quiero* guardar en base de datos los PDFs de facturas generadas en proceso masivo,
*para* asegurar trazabilidad y consulta posterior.

**Criterios de aceptación**
- Toda factura emitida por batch persiste su PDF en base de datos.
- Se guarda metadato mínimo (tipo, fecha, referencia, identificador del documento).

**ID: US-PDF-03 - Persistencia de PDFs en Pago**
*Como* sistema,
*quiero* guardar en base de datos el PDF del recibo y, si aplica, la nota de crédito generada al pagar,
*para* mantener respaldo documental completo del cobro.

**Criterios de aceptación**
- Cada pago guarda PDF de recibo en base de datos.
- Si se genera nota de crédito, su PDF también se guarda en base de datos.

**ID: US-PDF-04 - PDF de Contrato al Activar**
*Como* administrador,
*quiero* generar y guardar PDF del contrato cuando pase de borrador a activo,
*para* conservar la versión formal vigente del contrato.

**Criterios de aceptación**
- El evento de cambio `borrador -> activo` dispara generación de PDF.
- El PDF de contrato activo se guarda en base de datos con referencia al contrato.

**ID: US-PDF-05 - Consulta Unificada de PDFs por Módulo**
*Como* usuario operativo,
*quiero* consultar todos los PDFs desde su módulo funcional,
*para* acceder rápido a comprobantes y contratos.

**Criterios de aceptación**
- Recibos consultables desde pagos.
- Facturas y notas de crédito consultables desde facturas.
- Contratos consultables desde contratos.
