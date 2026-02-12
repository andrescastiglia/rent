# Documento de Requerimientos Funcionales (DRF) – Plataforma de Administración de Alquileres

## 1. Introducción

El objetivo general de esta plataforma es centralizar y automatizar la gestión de una cartera de propiedades en alquiler, mejorando la eficiencia operativa y reduciendo errores humanos. En particular, se buscará la **consolidación y centralización de los datos críticos** del negocio inmobiliario (propiedades, contratos, pagos, etc.) en un único sistema robusto [1](#ref-1). El alcance abarca inmuebles residenciales, comerciales y vacacionales, con funcionalidades adaptadas a cada tipo (por ejemplo, temporadas cortas para vacacionales y contratos de largo plazo para residenciales).

Los usuarios del sistema incluyen:

- **Administradores del sistema**: personal de la empresa inmobiliaria encargados de la configuración, mantenimiento y supervisión general.
- **Gestores o administradores de propiedades**: encargados de crear y actualizar información de propiedades, contratos, mantenimiento y reportes diarios.
- **Propietarios de inmuebles**: usuarios que podrán acceder a su portal privado para consultar la situación de sus propiedades (estado de contratos, recibos de pago, informes financieros).
- **Inquilinos**: usuarios que acceden a su portal para pagar rentas, consultar contratos y solicitar mantenimientos.
- **Equipo de mantenimiento**: personal técnico que gestiona las órdenes de trabajo generadas por inquilinos o administradores.
- **Equipo contable/finanzas**: usuarios que utilizan el sistema para consolidar la información de pagos, generar reportes fiscales y conciliaciones bancarias.

Cada tipo de usuario tendrá permisos específicos: por ejemplo, los inquilinos podrán ver sus propios datos y contratos, pagar rentas y crear solicitudes de mantenimiento, mientras que los propietarios solo accederán a información de sus inmuebles. En resumen, la plataforma debe cubrir desde la captación de interesados hasta la facturación, pasando por la firma de contratos, el cobro de rentas y la generación de reportes, con portales diferenciados para administradores, inquilinos y propietarios [2](#ref-2) [1](#ref-1).

## 2. Módulos principales del sistema

La plataforma se estructurará en los siguientes módulos o áreas funcionales clave:

- **Gestión de Propiedades**: registro y administración de datos de cada inmueble (dirección, tipo, características, fotografías, estado, etc.). Debe permitir CRUD (crear, editar, eliminar, consultar) de propiedades, así como asignarles contratos o unidades vacantes.
- **Gestión de Contratos (Arrendamientos)**: administración de contratos de alquiler. El sistema debe permitir generar contratos (con términos, duraciones, importes, caucciones), modificarlos (prórrogas, actualizaciones de canon), cancelar contratos y emitir alertas de vencimientos próximos. Incluirá generación de documentos (contratos en PDF) y control de estado (vigente, rescindido).
- **Gestión de Inquilinos/Clientes**: base de datos de inquilinos actuales y potenciales. Incluirá registro de nuevos inquilinos (datos personales, referencias, historial crediticio), edición de datos, baja de inquilinos, y validaciones (p.ej. identificación única). Permitirá vincular inquilinos a contratos y ver su historial de pagos.
- **Gestión Comercial / CRM**: captura de leads e interesados, campañas de correo, asignación de prospectos. Permite registrar interesados potenciales, hacer seguimiento (llamadas, visitas) y convertirlos en inquilinos al concretar el alquiler. Debe incluir *alertas de coincidencias* entre propiedades disponibles y clientes potenciales [3](#ref-3), así como herramientas de mensajería masiva para campañas.
- **Portal de Propietarios y de Inquilinos**: interfaces web móviles dedicadas a cada parte. El portal de inquilinos permitirá pagar rentas en línea, ver el contrato, historial de pagos, comunicarse con administración y solicitar mantenimientos. El portal de propietarios mostrará estado de contratos, flujos de caja (pagos recibidos), documentos y reportes de sus propiedades. Debe incluir sistemas de autenticación y roles separados [4](#ref-4).
- **Gestión de Mantenimiento**: sistema de tickets para solicitudes de reparación o servicios. Los inquilinos podrán crear órdenes de trabajo (descripción del problema, fotos) [5](#ref-5); el personal de mantenimiento las asignará, actualizará estado (pendiente, en proceso, resuelto) y registrará costos asociados. Debe permitir adjuntar fotos, historial de intervenciones y notificar avances.
- **Gestión de Pagos y Facturación**: registro de pagos de rentas y otros cargos. Debe generar recibos electrónicos (comprobantes), procesar pagos en línea (tarjeta de crédito, transferencia) e integrarse con pasarelas de pago. Incluirá cálculo automático de intereses por mora (punitorio) y emisión de liquidaciones mensuales [6](#ref-6). Soporta pagos recurrentes: programar cobranzas periódicas automáticas. Se debe llevar el historial de pagos por inquilino y contabilidad interna.
- **Reportes Financieros y Estadísticas**: generación de reportes estándar (resumen de ingresos por período, rent roll, cuentas por cobrar vencidas, flujo de caja) y personalizados. Debe permitir filtrar por propiedad, periodo y tipo de ingreso/egreso. Asimismo, incluirá dashboards con indicadores clave (ingresos, ocupación, morosidad). Facilitar exportación a PDF/Excel.
- **Notificaciones y Alertas**: módulo para enviar avisos por whatsapp/push. Envío de recordatorios de pago, alertas de contratos próximos a vencer, confirmaciones de mantenimientos, campañas de marketing. Debe gestionar plantillas de mensajes y registros de envíos (registro de notificaciones enviadas).
- **Seguridad y Control de Acceso (RBAC)**: aunque no es un “módulo funcional” de negocio, el sistema debe incluir gestión de usuarios y roles. Cada usuario tendrá credenciales y permisos basados en su rol (administrador, gestor, propietario, inquilino, etc.), de modo que sólo pueda acceder a las funciones y datos autorizados.

Estos módulos básicos cubren todas las áreas de la operación inmobiliaria. En ellos se incluirán todas las acciones típicas (crear/editar/eliminar/consultar) y flujos de trabajo asociados, tal como ocurre en soluciones avanzadas de gestión de propiedades [7](#ref-7) [8](#ref-8).

## 3. Requerimientos funcionales por módulo

A continuación se describen las funcionalidades detalladas por cada módulo, incluyendo operaciones CRUD, validaciones y flujos comunes:

### 3.1 Gestión de Propiedades
- **Crear propiedad**: formulario con datos obligatorios (dirección, tipo, superficie, precio de alquiler, estado, características). Validar que la dirección no esté duplicada.
- **Editar propiedad**: modificar cualquiera de los campos anteriores; el sistema deberá guardar histórico de cambios.
- **Eliminar propiedad**: sólo si no está asociada a un contrato activo. Si existe historial de contratos, se mantendrá la propiedad como inactiva para no perder datos históricos.
- **Consultar/listar propiedades**: búsqueda por filtros (ubicación, tipo, estado, precio), con paginación y vistas en lista o mapa. Cada propiedad mostrará su ficha completa (incluyendo fotos y documentos adjuntos).
- **Asignar / actualizar estado**: marcar una propiedad como “vacante”, “alquilada”, “mantenimiento”, etc., según corresponda al flujo. Cambios de estado deben disparar otras acciones (p.ej. liberar una unidad al dar de baja un contrato).
- **Validaciones**: campos obligatorios (ubicación, tipo, precio); formatos numéricos para valores; imágenes en formatos aceptados; restricciones de negocio (p.ej. una propiedad “vacante” no debe tener inquilinos asignados).

### 3.2 Gestión de Contratos (Arrendamientos)
- **Crear contrato**: asociar una propiedad y un inquilino, definir fecha de inicio, plazo (fechas fija o indefinido), canon de alquiler, depósito, incrementos (índice o porcentaje). Generar automáticamente el documento de contrato en PDF con datos completos.
- **Editar contrato**: modificar términos antes de la firma (por ejemplo, plazo o renta). Luego de la firma, las ediciones estarán sujetas a renovaciones o anexos.
- **Renovar contrato**: registrar prórrogas con nuevos términos. El sistema debe generar anexo de renovación y actualizar fechas.
- **Cancelar / finalizar contrato**: registrar terminación anticipada o por vencimiento. Al finalizar, calcular liquidación final y liberar la propiedad.
- **Alertas y recordatorios**: el sistema notificará automáticamente (whatsapp) cuando queden X días para el vencimiento del contrato. Las alertas pueden configurarse (plazo para aviso).
- **Consulta de contratos**: listar todos los contratos con filtros por estado (vigente, vencido, pendiente de firma) y buscar por inquilino o propiedad. Mostrar detalles financieros (renta, comisión).
- **Validaciones**: evitar solapamiento de contratos para la misma propiedad. Verificar que la fecha de inicio sea anterior a fin. Controlar coeficientes de actualización vigentes (p.ej. IPC).

### 3.3 Gestión de Inquilinos
- **Crear inquilino**: registrar datos personales (nombre, DNI/cédula, contacto, referencias, trabajo), documentos escaneados (contraseña, contratos anteriores).
- **Editar inquilino**: actualizar datos de contacto, garantía o situación económica. Mantener historial de cambios.
- **Eliminar inquilino**: sólo si no tiene contratos vigentes ni pagos pendientes; de otro modo inactivar al marcarlo como antiguo.
- **Consulta de inquilinos**: buscar y filtrar inquilinos por nombre, documento o estado. Ver historial de contratos asociados, historial de pagos y deudas.
- **Flujos asociados**: al ingresar un inquilino a un contrato, el sistema debe generar recordatorios automáticos de pago según el cronograma. También vincular solicitudes de mantenimiento con el inquilino que las genera.
- **Validaciones**: identidad única (no duplicar DNI), formato de email/teléfono, verificación de edad mínima, etc.

### 3.4 Gestión Comercial / CRM
- **Captura de leads**: registrar interesados mediante formularios web o manualmente (nombre, contacto, requerimientos).
- **Seguimiento de oportunidades**: asignar responsables y estados (nuevo, contactado, visitado, cerrado). Registrar notas de contacto y actividades (llamadas, WhatsApp).
- **Emparejamiento automático**: sugerir propiedades al interesado según criterios (zona, precio), generando alertas de coincidencias [3](#ref-3).
- **Comunicación masiva**: enviar boletines o promociones a listas de interesados/cliente. El sistema permitirá cargar plantillas de mensajes de WhatsApp y programar envíos (integrable con plataformas de mensajería de WhatsApp).
- **Reportes de ventas**: estadísticas de conversión (porcentaje de leads convertidos en inquilinos), tiempo de cierre promedio, etc.

### 3.5 Portal de Propietarios e Inquilinos
- **Portal de inquilinos**: acceso con usuario/contraseña; permite ver el contrato en vigor, descargable en PDF, y el historial de pagos. Desde allí el inquilino podrá **pagar renta en línea** (tarjeta o débito bancario) [8](#ref-8), consultar el estado de cuentas (balanza deudora), y enviar solicitudes de mantenimiento con imágenes adjuntas [5](#ref-5). También recibirá notificaciones de la administración (mensajes internos).
- **Portal de propietarios**: acceso seguro para cada propietario; mostrará lista de sus inmuebles, estado de cada contrato y pagos mensuales recibidos. Puede descargar reportes consolidados (ingresos por propiedad, balances). También recibe avisos de eventos (ej. rentas cobrada, fin de contrato).
- **Mensajería interna**: ambos portales integrarán sistema de chat o foro básico para comunicarse con el gestor de propiedades o entre inquilinos y vecinos.

### 3.6 Gestión de Mantenimiento
- **Crear solicitud**: el inquilino ingresa detalle del problema, categoría (plomería, electricidad, limpieza, etc.) y opcionalmente sube fotos [5](#ref-5). El sistema asigna un número de ticket y notifica al personal de mantenimiento.
- **Asignar tarea**: el administrador o gerente de mantenimiento asigna el ticket a un técnico, estableciendo prioridad y fecha límite de atención.
- **Actualizar estado**: el técnico informa avances en el ticket (en proceso, resuelto) y agrega comentarios o facturas (p.ej. repuestos usados). El inquilino recibe notificaciones del progreso.
- **Histórico de mantenimiento**: cada propiedad e inquilino acumulará un registro de todas las solicitudes pasadas y acciones realizadas, facilitando el seguimiento de problemas recurrentes.
- **Validaciones**: una misma solicitud duplicada será detectada por el sistema si otro inquilino del mismo inmueble reportó el mismo problema (opcional alertar de posible duplicado).

### 3.7 Gestión de Pagos y Facturación
- **Generación de recibos**: al ingresar un pago, el sistema emitirá un recibo o factura electrónica inmediata, compatible con la normativa local (por ejemplo, integración con AFIP para facturación electrónica en Argentina) [9](#ref-9). Estos comprobantes pueden ser descargados por el propietario y archivados automáticamente.
- **Registrar pagos**: ingreso manual o automático de pagos de renta. Si es automático, el sistema debitará la cuenta del inquilino en la fecha acordada y registrará el movimiento.
- **Pagos recurrentes**: opción para programar cobros periódicos (p. ej. cada mes), con generación anticipada de aviso. Los usuarios pueden configurar pago de rentas con débito automático.
- **Cálculo de mora**: el sistema calcula automáticamente intereses moratorios o multas por pagos tardíos, según políticas configuradas, e incluye esos cargos en la próxima factura.
- **Conciliación contable**: integración con software contable; permite exportar movimientos financieros a formatos estándar o a sistemas externos [10](#ref-10). Los contadores podrán vincular cuentas bancarias para la conciliación diaria.
- **Reportes de cobranza**: listado de inquilinos morosos, pagos pendientes y cobrados. Incluye indicadores como porcentaje de ocupación con pagos al día.

### 3.8 Reportes Financieros
- **Reportes predefinidos**: al menos incluir: estado de resultados (ingresos por rentas vs. gastos de mantenimiento), balance general de cartera, lista de ingresos por propiedad (“rent roll”), flujo de caja proyectado.
- **Reportes personalizados**: el usuario podrá filtrar criterios (rango de fechas, seleccionando propiedades o cuentas) y generar gráficos.
- **Exportación**: todos los reportes podrán descargarse en PDF o Excel. Para cumplir con regulaciones fiscales, el sistema ofrecerá reportes específicos (por ejemplo, IVA discriminado).
- **Automatización de reportes**: posibilidad de programar envíos automáticos de reportes periódicos (diarios/semanales/mensuales) a administradores o propietarios.

### 3.9 Notificaciones
- **WhatsApp**: el sistema enviará mensajes de WhatsApp automáticos en eventos clave (nuevo contrato firmado, recibo generado, mantenimiento completado, etc.).
- **Preferencias del usuario**: cada propietario o inquilino elegirá qué notificaciones recibe (por ejemplo, algunos podrían preferir solo WhatsApp).
- **Plantillas dinámicas**: se administrarán plantillas con campos dinámicos (nombre, monto, fecha) para cada tipo de mensaje, facilitando personalizar la comunicación sin programar.
- **Registro de envíos**: se almacenará un log de todas las notificaciones enviadas para auditoría.

Cada módulo incluirá flujos de trabajo bien definidos (p.ej. al registrar un nuevo alquiler, se crea simultáneamente el contrato, se programa la cobranza mensual y se emite una notificación al propietario). Además, todas las pantallas de creación o edición tendrán validaciones de campos (campos obligatorios, formatos, rangos lógicos, etc.) para garantizar la calidad de los datos. En conjunto, la plataforma cumplirá funciones básicas comunes a soluciones profesionales: **ingresar, actualizar, eliminar y consultar** datos de inmuebles, contratos, inquilinos, etc., con controles de negocio en cada operación [6](#ref-6) [8](#ref-8).

## 4. Requerimientos no funcionales

Los requerimientos no funcionales definen las características de calidad del sistema. Entre los más relevantes para esta plataforma figuran:

- **Rendimiento y escalabilidad**: el sistema debe soportar simultáneamente cientos de usuarios (administradores y clientes) con tiempos de respuesta rápidos (<2 segundos para consultas). Debe ser posible escalar horizontalmente en la nube para manejar crecimientos de carga en la cartera de propiedades. En particular, se buscará un rendimiento que permita procesar cobros automáticos y generar reportes pesados sin interrupciones perceptibles [11](#ref-11).
- **Seguridad**: todos los datos sensibles (contraseñas, información financiera) se almacenarán cifrados y las comunicaciones deberán emplear HTTPS. Se implementará autenticación robusta (contraseña+2FA opcional) y control de acceso por roles (Role-Based Access Control). El sistema registrará auditoría de eventos críticos (inicio de sesión, cambios de contratos, emisión de recibos) [11](#ref-11) [10](#ref-10).
- **Disponibilidad y fiabilidad**: se exigirá alta disponibilidad (por ejemplo, 99.9% uptime) y tolerancia a fallos. Se planificarán respaldos automáticos periódicos (bases de datos y archivos) con capacidad de restauración de desastres.
- **Compatibilidad móvil**: la plataforma web será responsive, garantizando usabilidad óptima en navegadores móviles. En caso de desarrollarse apps nativas futuras, la arquitectura deberá brindar APIs REST que puedan ser consumidas por apps Android/iOS.
- **Mantenibilidad**: el código estará modularizado y documentado, facilitando futuras actualizaciones. La interfaz será intuitiva y estandarizada para minimizar la curva de aprendizaje. El diseño seguirá patrones arquitectónicos modernos (MVC o microservicios), permitiendo actualizaciones independientes de cada módulo.
- **Portabilidad y hosting**: debe poder desplegarse en infraestructura en la nube (AWS, Azure o similar). Idealmente empleará contenedores o servicios serverless para facilitar el despliegue automático.
- **Seguridad de la información**: cumplimiento de normas legales aplicables (protección de datos personales, GDPR/CPRA si corresponde). Incluye cifrado en reposo y en tránsito, políticas de acceso mínimo, y generación de logs auditable.
- **Usabilidad**: interfaz amigable con formularios de ayuda y validación en tiempo real. Se considerarán pruebas de usabilidad con usuarios finales para asegurar adopción.
- **Internacionalización (opcional)**: aunque inicialmente se implementará en español, el sistema deberá soportar fácil traducción a otros idiomas si fuese necesario.

En conjunto, estos NFR garantizan que la plataforma no solo haga lo que debe sino que lo haga bien bajo cargas reales y con un elevado estándar de calidad [11](#ref-11) [1](#ref-1).

## 5. Integraciones externas

El sistema se integrará con servicios y plataformas de terceros para potenciar su funcionalidad:

- **Pasarelas de pago**: integración con al menos dos proveedores de pagos en línea (por ejemplo, Stripe, PayPal, MercadoPago) para procesar cobros con tarjeta de crédito/débito o débito bancario directo. Debe soportar pagos recurrentes y billeteras digitales.
- **Facturación electrónica y contabilidad**: comunicación con sistemas contables externos (p.ej. QuickBooks, Xero o soluciones locales como Contpaqi/SAP) para exportar transacciones financieras [10](#ref-10). Si corresponde al país, integración con servicios de facturación electrónica nacional (por ejemplo AFIP en Argentina) [9](#ref-9), de modo que los comprobantes emitidos en la plataforma queden también registrados ante la autoridad tributaria.
- **Firmas digitales**: uso de APIs de proveedores de firma electrónica (DocuSign, Adobe Sign o plataformas locales) para firmar contratos de manera online con validez legal. Al firmar un contrato en la plataforma, se enviará automáticamente al inquilino/propietario para firma digital.
- **Portales y listados inmobiliarios**: consumo de APIs de portales inmobiliarios (Idealista, Zillow, Airbnb, Booking.com, etc.) para publicar automáticamente las propiedades vacantes y sincronizar estados de reservas en el caso de alquileres vacacionales. Esto amplía la visibilidad de las propiedades gestionadas.
- **Servicios de mensajería**: integración con proveedores de SMS y WhatsApp (p.ej. WhatsApp Cloud API, Nexmo) para enviar alertas y notificaciones; con plataformas de email masivo (p.ej. WhatsApp Cloud API, Mailchimp) para campañas de CRM. Estos servicios permitirán escalar las notificaciones sin cargar el servidor principal.
- **Servicios de notificaciones push**: en caso de contar con apps móviles futuras, integración con servicios de notificaciones push (Firebase, OneSignal) para alertar eventos en tiempo real.
- **APIs de análisis y datos externos**: opcionalmente, integración con APIs de datos de mercado (por ejemplo, información de precios de referencia de la zona) para alimentar módulos de analítica.
- **Infraestructura en la nube**: uso de servicios cloud (bases de datos gestionadas, buckets de almacenamiento) para asegurar escalabilidad. Por ejemplo, almacenamiento de archivos en Amazon S3, base de datos PostgreSQL en RDS, etc.

Gracias a estas integraciones el software podrá, por ejemplo, emitir facturas legales automáticamente (via AFIP) [9](#ref-9), registrar pagos con tarjeta a través de Stripe, y sincronizar anuncios de propiedades con portales inmobiliarios externos. La **integración con software contable** facilitará la conciliación financiera [10](#ref-10), mientras que las APIs de firma digital agilizarán la formalización de contratos sin papel.

## 6. Flujos críticos del sistema

Se definen a continuación los flujos de trabajo clave que debe soportar la plataforma:

- **Registro de un nuevo alquiler**: desde el departamento comercial se ingresa un cliente y se crea su ficha de inquilino. Se selecciona una propiedad disponible, se define el contrato (inicial, duración, renta) y se genera el documento. El contrato se firma digitalmente con ambas partes, se crea automáticamente la primera factura y se programa el cobro mensual futuro. Este flujo integra módulos de CRM, contratos, pagos y notificaciones.
- **Cobro automático de renta**: el sistema programará cobros periódicos (p. ej. cada mes) debitando la cuenta del inquilino o enviando recordatorios. Al procesarse el pago, se emitirá el recibo electrónico y se notificará al propietario y al inquilino. En caso de fallo o impago, generará automáticamente el cálculo de mora.
- **Solicitud de mantenimiento**: el inquilino ingresa una solicitud de reparación, que automáticamente crea un ticket. El administrador la revisa, asigna personal técnico y establece fecha de atención. El técnico actualiza el estado hasta cierre, liberando al final el ticket y notificando al inquilino.
- **Generación de reportes**: un usuario administrador selecciona parámetros (por ejemplo, periodo mensual) y ejecuta la generación de reportes financieros. El sistema extrae los datos (contratos vigentes, pagos efectuados, gastos) y arma los informes en PDF o Excel. Este flujo puede programarse para su ejecución periódica automática.
- **Renovación automatizada (futuro)**: el sistema podría identificar contratos próximos a vencer y generar una propuesta de renovación automática al inquilino (aunque inicialmente esto puede ser semimanual). En futuras versiones se espera automatizar este proceso.

Estos flujos críticos combinan varias funcionalidades de la plataforma y deben ser completamente seguros y auditables. Por ejemplo, al registrar un alquiler nuevo se verifica que no haya conflictos de fechas, y al cobrar automáticamente se valida que los fondos sean correctos, informando cualquier incidencia al usuario correspondiente. Cada paso deberá producir logs o registros de auditoría para trazabilidad.

## 7. Consideraciones adicionales y futuros módulos

Pensando en la evolución a largo plazo de la plataforma, se consideran potenciales extensiones:

- **Automatización de renovaciones**: módulo que calcule propuestas de renovación de contratos basándose en el historial de pagos y tendencias de mercado, y notifique automáticamente a las partes (puede incluir opción de aceptación en un clic). Esto reduciría la carga administrativa de verificar expiraciones manualmente.
- **IA para fijación de precios**: incorporar análisis avanzados (big data / machine learning) para sugerir rentas óptimas. Por ejemplo, sistemas de valoración basados en IA pueden aprender de grandes volúmenes de datos (propiedades similares, ubicación, demanda estacional) y proponer precios de alquiler objetivo con alta precisión [12](#ref-12). Esta funcionalidad se adapta a tendencias del PropTech actual, donde la **IA aprende de millones de casos pasados** para ajustar dinámicamente los precios de mercado [12](#ref-12).
- **Integración con IoT y domótica**: conectar sensores inteligentes en las propiedades para mantenimiento preventivo. Por ejemplo, detectores de humo, humedad o consumo energético que informen automáticamente de anomalías (fugas de agua, exceso de consumo) a través de la plataforma de mantenimiento. Esto permitiría al gestor recibir alertas tempranas y programar tareas de mantenimiento predictivo. Aunque inicialmente no es obligatorio, la arquitectura debe permitir sumar estos dispositivos (API de IoT).
- **Expansión multicanal**: en el futuro se podría agregar integración con WhatsApp Business API para atención al cliente, o chatbots en web para responder preguntas frecuentes de inquilinos.
- **Dashboard de inteligencia de negocios (BI)**: módulo avanzado que consolide datos de todos los inmuebles (tasa de ocupación, retorno de inversiones, benchmarking) en un panel de gestión ejecutiva. Incluye análisis de tendencias por barrio, períodos de alta demanda, etc.
- **Cumplimiento normativo automatizado**: alertas sobre aspectos legales (p.ej. nuevos decretos sobre alquileres, vencimiento de cédulas catastrales o certificados obligatorios) para que la administración esté al día.

Estas consideraciones futuras muestran la dirección de crecimiento de la plataforma: no solo mantener la operativa actual, sino anticipar mejoras y tecnologías emergentes que añadan valor. Por ejemplo, la **IA en fijación de precios** se perfila como la evolución tecnológica definitiva del método comparativo tradicional [12](#ref-12), democratizando la información de mercado para evitar decisiones subjetivas. Asimismo, el uso de **IoT en mantenimiento inteligente** optimizará la gestión de activos reduciendo costos operativos.

## Referencias

- <a id="ref-1"></a>[1] [Características del software de gestión de propiedades: Imprescindibles para los administradores técnicos de propiedades](https://proprli.com/es/centro-de-conocimiento/caracteristicas-del-software-de-gestion-de-propiedades-imprescindibles-para-los-administradores-tecnicos-de-propiedades/)
- <a id="ref-2"></a>[2] [Programas de gestión de alquileres gratis - Capterra República Dominicana 2025](https://www.capterra.do/directory/30929/rental-property-management/pricing/free/software)
- <a id="ref-3"></a>[3] [face.unt.edu.ar](https://face.unt.edu.ar/web/iadmin/wp-content/uploads/sites/2/2024/05/PP-15_compressed.pdf)
- <a id="ref-4"></a>[4] [Programas de gestión de alquileres gratis - Capterra República Dominicana 2025](https://www.capterra.do/directory/30929/rental-property-management/pricing/free/software)
- <a id="ref-5"></a>[5] [SRS Update](https://capstone.cs.ucsb.edu/team_docs_13/SRS/SRS_FooTang_Clan.pdf)
- <a id="ref-6"></a>[6] [face.unt.edu.ar](https://face.unt.edu.ar/web/iadmin/wp-content/uploads/sites/2/2024/05/PP-15_compressed.pdf)
- <a id="ref-7"></a>[7] [El mejor software de administración de propiedades para tus necesidades en 2025 | Rocket Mortgage](https://www.rocketmortgage.com/es/learn/software-de-gestion-de-la-propiedad)
- <a id="ref-8"></a>[8] [El mejor software de administración de propiedades para tus necesidades en 2025 | Rocket Mortgage](https://www.rocketmortgage.com/es/learn/software-de-gestion-de-la-propiedad)
- <a id="ref-9"></a>[9] [face.unt.edu.ar](https://face.unt.edu.ar/web/iadmin/wp-content/uploads/sites/2/2024/05/PP-15_compressed.pdf)
- <a id="ref-10"></a>[10] [Características del software de gestión de propiedades: Imprescindibles para los administradores técnicos de propiedades](https://proprli.com/es/centro-de-conocimiento/caracteristicas-del-software-de-gestion-de-propiedades-imprescindibles-para-los-administradores-tecnicos-de-propiedades/)
- <a id="ref-11"></a>[11] [Requerimientos Funcionales y No Funcionales: qué son, en qué se diferencian y por qué son clave en el diseño de software - Mentores Tech](https://www.mentorestech.com/resource-blog-content/requerimientos-funcionales-y-no-funcionales-que-son-en-que-se-diferencian-y-por-que-son-clave-en-el-diseno-de-software)
- <a id="ref-12"></a>[12] [Análisis de Datos e IA: La Nueva Era de la Fijación de Alquileres | Japan Luxury Realty Group](https://app.ina-gr.com/es/archives/ai-rent-pricing-real-estate-data-analysis)
- <a id="ref-13"></a>[13] [Características del software de gestión de propiedades: Imprescindibles para los administradores técnicos de propiedades](https://proprli.com/es/centro-de-conocimiento/caracteristicas-del-software-de-gestion-de-propiedades-imprescindibles-para-los-administradores-tecnicos-de-propiedades/)
