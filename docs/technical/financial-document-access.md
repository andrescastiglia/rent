# Descarga e integridad de comprobantes

Las descargas de facturas, recibos de cobro, notas de crédito y recibos de venta
autorizan primero la entidad de negocio. Después buscan el documento por ID,
compañía, tipo e ID de esa entidad. La misma restricción se aplica a HTTP y a las
herramientas IA: una referencia `db://document/…` no concede acceso por sí sola.
El alcance es obligatorio para los consumidores internos autenticados.

Solo se entregan documentos aprobados, sin borrado lógico y con contenido.
Las consultas de comprobantes de liquidaciones también excluyen archivos pendientes,
rechazados o vencidos. Si un comprobante de transferencia ya generado deja de estar
disponible, el movimiento informa `receiptAvailable=false` y
`receiptStatus=unavailable`; la interfaz deja de presentarlo como una generación
pendiente y no ofrece su descarga. La lectura no regenera el documento.

## Integridad y enlaces temporales

Los nuevos documentos financieros conservan SHA-256 de los bytes persistidos en
`metadata`, con `source=financial_document` e `integrityVersion=1`. Esta versión
describe el formato de metadatos, no una revisión comercial del comprobante.
Todas las rutas de descarga verifican el hash para las fuentes protegidas:
`financial_document`, `lease_contract` y `mercadopago_payout`. Un hash ausente o
distinto produce HTTP 409. No se modifican las plantillas ni los bytes renderizados.

Los enlaces generales de documentos conservan su autorización por actor y compañía.
El enlace de WhatsApp es una capacidad temporal para un documento concreto: valida
ID, firma HMAC y vencimiento antes de usar un método interno separado. También
exige aprobación y verifica integridad; no permite usar el método general sin alcance.
Compartir un enlace válido concede la descarga hasta su vencimiento o hasta que el
documento deje de estar aprobado/disponible.

El hash local no acredita firma digital ni sellado externo. No se invoca BFA,
Mercado Libre, Mercado Pago ni se envían mensajes. Los proveedores siguen apagados.
Los documentos históricos sin estos metadatos conservan lectura autorizada y
aprobación obligatoria; no se les atribuye una verificación de hash inexistente.
El backfill, la revisión comercial y la regeneración histórica controlada siguen
pendientes. La emisión nueva usa la [cola de facturas](invoice-documents.md).

## Pruebas y operación

`financial-document-helpers.ts`, usado por las suites de pagos y ventas, genera
documentos reales y comprueba sus bytes/hash. Modifica temporalmente compañía,
entidad, tipo, aprobación, borrado lógico y contenido en PostgreSQL para verificar
rechazos tanto por HTTP como por las herramientas IA con servicios reales.
`documents.e2e-spec.ts` verifica enlaces HMAC vencidos, ID cambiado, aprobación e
integridad. Las suites de liquidaciones verifican selección de documentos aprobados,
retiro de comprobantes y recuperación de disponibilidad al aprobarlos nuevamente.
Las pruebas de interfaz cubren el estado no disponible sin descarga ni reenvío.

Validación local: 242 E2E con PostgreSQL real, 1.395 unitarias backend y 429 pruebas
web. Los proveedores usan dobles de prueba; esta evidencia no acredita una conexión
real ni autoriza su activación.

No hay migración ni nuevas credenciales. Desplegar backend y clientes generados
compatibles con el estado adicional. Ante un 409 conservar los bytes y metadatos
para investigar; no sobrescribir el hash para hacer pasar la comprobación. Un
rollback del código anterior retiraría estos controles, por lo que se prefiere una
corrección hacia adelante y suspender la descarga afectada hasta resolverla.
