# Historias de Usuario

## 1. Gestión de Propiedades y Propietarios

**ID: US-PROP-01 - Registro de Contacto de Propietario**
*Como* administrador,
*quiero* poder registrar el número de WhatsApp del propietario en la ficha de la propiedad,
*para* tener un canal de comunicación directo y ágil.

**ID: US-PROP-02 - Registro de Visitas (Bitácora)**
*Como* agente inmobiliario,
*quiero* registrar cada visita realizada a una propiedad (fecha, interesado, comentarios),
*para* mantener un historial de actividad de la propiedad.

**ID: US-PROP-03 - Notificación Automática de Visitas**
*Como* sistema,
*quiero* enviar automáticamente un mensaje (WhatsApp/Email) al propietario luego de registrar una visita, informando que se realizó y si hubo oferta (fecha y valor),
*para* mantener al propietario informado sobre el trabajo realizado en su inmueble sin necesidad de reportes manuales constantes.

## 2. Búsqueda y Filtros (Matchmaking)

**ID: US-SEARCH-01 - Filtro de Inversión en Ventas**
*Como* agente de ventas,
*quiero* filtrar las propiedades en venta por rangos de montos de inversión,
*para* ofrecer opciones que se ajusten al presupuesto del comprador rápidamente.

**ID: US-SEARCH-02 - Perfilado Detallado de Interesado**
*Como* agente comercial,
*quiero* registrar interesados (compra o alquiler) con detalles específicos: número de teléfono, cantidad de personas, monto máximo a abonar, tenencia de mascotas, tipos de garantías y tipo de inmueble (casa/depto),
*para* tener una base de datos cualificada para cruzar con el inventario.

**ID: US-SEARCH-03 - Búsqueda Cruzada (Match)**
*Como* agente,
*quiero* filtrar la búsqueda de inquilinos o compradores basándome en los criterios de su perfil (del US-SEARCH-02) contra las propiedades disponibles,
*para* encontrar rápidamente el candidato ideal para una propiedad.

## 3. Gestión de Inquilinos

**ID: US-TENANT-01 - Búsqueda Rápida**
*Como* cobrador o administrador,
*quiero* encontrar fluida y rápidamente a un inquilino buscando por su Apellido,
*para* agilizar el proceso de cobro y atención en mostrador.

**ID: US-TENANT-02 - Visualización de Vigencia de Contrato**
*Como* administrador,
*quiero* ver claramente la fecha de inicio y finalización del contrato en la pestaña/ficha principal del inquilino,
*para* responder consultas rápidamente sin tener que abrir documentos adjuntos o navegar a otras pantallas.

## 4. Gestión de Pagos y Recibos (Alquileres)

**ID: US-PAY-01 - Recibos con Items Variables**
*Como* administrador,
*quiero* que el recibo de alquiler incluya items variables editables (como impuestos o servicios que abona la inmobiliaria por cuenta del inquilino),
*para* que el total a cobrar sume correctamente el alquiler más los gastos variables del mes.

**ID: US-PAY-02 - Edición de Recibos Pre-Emisión**
*Como* administrador,
*quiero* poder modificar cualquier dato del recibo del mes corriente (importe, concepto, servicios) ante cualquier eventualidad antes de cerrarlo,
*para* corregir errores o agregar cargos de último momento.

**ID: US-PAY-03 - Histórico de Recibos Inmutable**
*Como* administrador,
*quiero* que los recibos de meses anteriores queden guardados en la carpeta del inquilino sin ser "pisados" o sobrescritos por los nuevos,
*para* poder reimprimir o consultar un recibo de un mes específico en el pasado.

**ID: US-PAY-04 - Gestión de Intereses por Mora**
*Como* cobrador,
*quiero* tener la opción de aplicar o no el interés por mora si el inquilino se atrasa,
*para* tener la flexibilidad de decidir el cobro del recargo según la relación con el cliente (ya que a algunos no se les cobra).

**ID: US-PAY-05 - Automatización de Fechas en Recibos**
*Como* sistema,
*quiero* actualizar automáticamente el mes y la fecha de vencimiento en la generación del nuevo recibo mensual,
*para* evitar errores manuales de fechas al cobrar el nuevo mes.

**ID: US-PAY-06 - Automatización de Ajustes e Índices (IPC/ICL)**
*Como* administrador,
*quiero* (opcionalmente) que el sistema calcule los nuevos valores de alquiler basados en índices (IPC, ICL, Casa Propia) y ajuste la comisión porcentual (3% o 5%) automáticamente,
*para* reducir el cálculo manual en las actualizaciones de contrato.

## 5. Ventas y Cuotas (Loteos)

**ID: US-SALES-01 - Gestión de Carpetas de Loteos**
*Como* administrador,
*quiero* organizar las ventas en cuotas mediante "carpetas" o agrupaciones por Loteo,
*para* gestionar ordenadamente los pagos de terrenos o propiedades financiadas.

**ID: US-SALES-02 - Recibos de Cuota con Saldo**
*Como* cobrador,
*quiero* emitir recibos de cuota que registren el pago y recuerden si existen atrasos o saldos a favor,
*para* mantener la cuenta corriente del cliente actualizada.

**ID: US-SALES-03 - Impresión Duplicada Obligatoria**
*Como* administrador,
*quiero* que el sistema imprima obligatoriamente los recibos de Cuotas de Venta por duplicado,
*para* cumplir con los requisitos administrativos de la empresa para este tipo de operaciones.
