# Plan de trabajo pendiente

**Actualizado:** 2026-09-29

**Fuente:** [Auditoría integral](auditoria-integral-2026-08-27.md)

Este documento contiene solo trabajo pendiente. El historial Git conserva lo terminado y su evidencia.

## 1. Cerrar bloqueantes P0

### Autorización y aislamiento

- [ ] Completar fixtures de dos compañías y pruebas negativas por ID ajeno para cada controlador y herramienta IA restante.
  Avance: las herramientas de usuarios filtran por compañía y las altas toman la
  compañía autenticada; IA y WhatsApp respetan permisos de módulo del personal y
  roles declarados. Evidencia: `ai-authorization.e2e-spec.ts` (8 casos con dos
  empresas) y `ai-tool-access-policy.spec.ts`. Liquidaciones valida listado, detalle,
  resumen y comprobantes con PostgreSQL real, dos compañías y roles propietario/
  administrador/inquilino (`settlement-reads.e2e-spec.ts`, 8 casos).
  Corrección de lecturas incorporada a main con los 23 gates del PR #222 aprobados.
  Facturas, recibos y notas de crédito ahora validan compañía, tipo e ID del
  documento tanto por HTTP como IA; los enlaces temporales exigen aprobación e
  integridad. Ver [alcance y pruebas](technical/financial-document-access.md).
  Controles documentales incorporados a main con los 23 gates del PR #234 aprobados.
  Pendiente: despliegue de esta corrección y los demás dominios.

### Consistencia financiera

- [ ] Asegurar que PDF, WhatsApp y proveedores se ejecuten desde outbox después del commit.
  Avance: confirmación de pagos y conciliación bancaria usan `payment_effects_outbox`
  (migración 111), con documentos y entregas atómicos, reintentos y dead letters.
  Ver [operación y pruebas](technical/payments.md#efectos-recuperables-de-confirmación).
  Ventas guarda cobro y `sale_receipt_effects_outbox` juntos (migración 112),
  con PDF recuperable, descarga autenticada y pruebas de concurrencia/rollback.
  Confirmación de contratos y cuenta/inmueble se guardan con una cola de PDF
  (migración 121); snapshot inmutable, reintentos, hash, descarga autorizada y estados
  en web/portal. Ver [operación y pruebas](technical/confirmed-contracts.md).
  Importación de contratos vigente ahora guarda contrato, archivo original, inmueble
  y cuenta en una transacción; hash/actor/versión y rechazo de importaciones concurrentes.
  Confirmación incorporada a main con los 23 gates del PR #230 aprobados.
  Importación incorporada a main con los 23 gates del PR #231 aprobados.
  Emisión de facturas implementada con cargo, comisión y cola de PDF en una
  transacción; snapshot de plantilla/partes, reintentos, hash y estado consultable
  desde web. HTTP, IA y emisión mensual comparten el recorrido.
  Ver [operación y límites](technical/invoice-documents.md). Incorporada a main
  con los 23 gates del PR #235 aprobados. Pendiente: despliegue.
  Generación HTTP/IA implementada con ajuste, borrador, calendario y emisión opcional
  atómicos; numeración por compañía y rechazo de períodos duplicados concurrentes.
  Ver [evidencia y límites](technical/invoice-generation.md). Incorporada a main
  con los 23 gates del PR #236 aprobados. Pendiente: despliegue y adopción del flujo común.
  Generación con clave UUID implementada para HTTP/IA (migración 123): recupera
  la factura original, rechaza cambios de parámetros y conserva claves tras bajas.
  Incorporada a main con los 23 gates del PR #237 aprobados.
  Pendiente: adopción por los demás clientes y despliegue.
  Batch de facturación migrado al backend con selección por fecha, claves estables,
  moneda del contrato, PDF/aviso consentido en colas y validación del CLI real.
  Migración 124 permite días 29–31 y ajuste a fin de mes. Se retiraron conversión
  automática a ARS y retenciones sobre la deuda del inquilino; ver
  [cambios de cálculo, pruebas y límites](technical/scheduled-billing.md).
  Incorporado a main con los 23 gates del PR #238 aprobados.
  Pendiente: configuración operativa y despliegue; cron suspendido.
  Historial de índices implementado (migración 125): ICL diario, IPC nivel mensual,
  IGP-M porcentaje mensual, revisiones inmutables y reintentos sin sobrescritura.
  Ver [ingestión, pruebas y límites](technical/inflation-observations.md).
  Historial incorporado a main con los 23 gates del PR #239 aprobados.
  Cálculo común acumulado implementado: ICL diario, IPC por niveles e IGP-M
  compuesto, rezago mensual explícito, calendario por fechas programadas,
  centavos exactos y snapshot inmutable visible en factura. Se retiró el calculador
  batch antiguo. Ver [operación y límites](technical/rent-adjustments.md).
  Incorporado a main con los 23 gates del PR #240 aprobados.
  Pendiente: revisión de calendarios/rezagos y datos reales, recuperación
  histórica y despliegue; los crons siguen suspendidos.
  Pendiente: recuperación histórica,
  verificar los demás productores de documentos/proveedores y desplegar.

El resumen del propietario usa el esquema contable actual y devuelve cobros
imputados por moneda, con mes de Argentina y errores explícitos en web. Ver
[contrato y límites](technical/owner-summary.md). Incorporado a main con los 23
gates del PR #232 aprobados. Pendiente: despliegue
coordinado de este contrato de API y su frontend.

El resumen de liquidaciones ahora conserva moneda, estado e importes exactos;
listado y resumen comparten filtros de mes/moneda y alcance. La herramienta IA
respeta los mismos roles que HTTP. Ver [contrato y pruebas](technical/settlement-summary.md).
Incorporado a main con los 23 gates del PR #233 aprobados.
Pendiente: despliegue de backend/clientes compatibles.

### WhatsApp seguro

- [ ] Garantizar ejecución exactamente una vez para cada herramienta mutable aprobada, incluso si el proceso cae después del efecto de dominio y antes de persistir el resultado.
  Avance: corregida la lectura de filas adquiridas/rechazadas en PostgreSQL;
  pruebas HTTP con dos compañías, concurrencia, reautenticación e integridad.
  Corrección incorporada a main con los 23 gates del PR #229 aprobados.
  Avance adicional: generación de facturas con resultado original inmutable en
  la misma transacción del cargo/calendario, clave estable por aprobación y
  recuperación con reautenticación tras fallos o vencimiento del intento.
  Las ejecuciones históricas sin garantía no se vuelven a ejecutar y las propuestas
  de la bandeja no admiten confirmación directa. Ver
  [alcance y pruebas](technical/approved-invoice-recovery.md).
  Generación recuperable incorporada a main con los 23 gates del PR #241 aprobados.
  Alta manual, emisión y anulación de facturas también guardan el resultado en
  su transacción (migración 128), con recuperación tras baja lógica y rollback
  de todos los efectos si falla la persistencia de la constancia.
  Alta, edición, confirmación y anulación de cobros usan la misma constancia
  transaccional; conceptos y pago se guardan juntos y la edición bloquea
  confirmaciones concurrentes. Ver [contrato y pruebas](technical/approved-payment-recovery.md).
  Pendiente: gates de este avance, idempotencia transaccional de las demás
  herramientas mutables y despliegue.

## 2. Completar recorridos de producto

- [ ] Personas/CRM: multirrol, deduplicación, importación, perfil de interés, matching, reservas, embudo configurable, timeline, consentimiento y métricas.
- [ ] Cobros: conceptos variables editables antes de emitir, mora opcional auditada, período/vencimiento automáticos, recibo y nota de crédito persistentes.
- [ ] Propiedades: filtros útiles, interesados, visitas y aviso consentido al propietario con fecha, oferta y valor.
- [ ] Ventas: cuotas transaccionales, atrasos, saldo a favor/crédito y original/duplicado verificables.
- [ ] Mantenimiento: solicitud, asignación, seguimiento, cierre, adjuntos, auditoría y notificaciones idempotentes.
- [ ] Corregir `FT-WCAG-001..010` y validar WCAG 2.2 AA, teclado, lector de pantalla, contraste y estados de error.

## 3. Completar canales e integraciones

- [ ] Validar lectura WhatsApp por capacidad y rol con evidencia, fecha, paginación, desambiguación y deep links seguros.
- [ ] Habilitar propuestas WhatsApp por dominio solo después de cerrar inbox/outbox y la bandeja de revisión.
- [ ] Llevar MercadoPago al flujo contable común con firma, replay, idempotencia y conciliación productiva.
- [ ] Persistir PDFs con checksum, versión, autorización y regeneración controlada.
  Avance: nuevos comprobantes financieros guardan SHA-256 y versión del formato
  de integridad; las descargas rechazan alteraciones y documentos no aprobados.
  Pendiente: gates, despliegue y recuperación/versionado de documentos históricos.

## 4. Operación, calidad y documentación

- [ ] Completar E2E con backend real en Android e iOS y conservar evidencia por plataforma.
- [ ] Cerrar gates RAG: integridad, recall ≥ 0,95, errores < 1 %, respuesta p95 < 8 s y frescura p95 < 60 s; conservar evidencia por tag/compañía.

## Integraciones a implementar, temporalmente deshabilitadas

Firma digital, publicación en portales y transferencias externas de liquidaciones
permanecen temporalmente deshabilitadas por instrucción del usuario (2026-09-28).
La implementación de proveedores reales forma parte de esta entrega, por
aclaración del usuario: BFA únicamente para sellado/verificación documental,
Mercado Libre para publicación inmobiliaria y Mercado Pago Payouts para
transferencias de liquidaciones. No existen cuentas ni credenciales; implementar
sin configurar ni activar proveedores. Se conserva la consulta histórica; no
deben ejecutarse simulaciones ni marcar transferencias como pagadas en producción.
El cron `process-settlements` permanece suspendido.

- [ ] Implementar BFA sin confundir sellado temporal con firma de las partes.
  Avance: cliente TSA2, cola durable, API por documento y consulta administrativa
  de constancias/versiones con alcance de compañía; interfaz bloqueada por defecto.
  Gates del PR #215 aprobados y cambios incorporados a main.
  Pendiente: despliegue deshabilitado.
- [ ] Implementar publicación, actualización y estados con Mercado Libre.
  Avance: cliente, cola durable y endpoints por compañía; creación sin reenvíos
  inciertos, recuperación por ID y estados confirmados por el proveedor.
  Cola incorporada a main con gates del PR #216 aprobados. OAuth persiste tokens
  cifrados por compañía, usa PKCE/estado de un solo uso y serializa renovaciones.
  OAuth incorporado a main con todos los gates del PR #217 aprobados.
  Interfaz administrativa de conexión y callback implementada, con bloqueo mientras
  esté deshabilitada, retorno sin persistir códigos y desvinculación local confirmada.
  Interfaz de conexión incorporada a main con gates del PR #218 aprobados.
  Revisión de incidencias implementada con auditoría y UI por propiedad: vinculación
  verificada, ausencia declarada, reintento por ID y aceptación del estado remoto.
  Revisión incorporada a main con gates del PR #219 aprobados.
  Catálogo por compañía y alta validada de borradores implementados: categorías
  inmobiliarias, atributos, unidades, tipos disponibles y ubicaciones de Argentina.
  Catálogo incorporado a main con los 23 gates del PR #220 aprobados.
  Editor administrativo implementado: borradores, atributos/unidades y ubicación,
  publicación separada con confirmación, actualización, pausa, reactivación y cierre.
  Bloquea envíos pendientes/inciertos y conserva campos inmutables de avisos existentes.
  Editor incorporado a main con los 23 gates del PR #221 aprobados.
  Pendiente: despliegue deshabilitado.
- [ ] Implementar transferencias Mercado Pago con idempotencia y conciliación.
  Avance: solicitud inmutable y cola por liquidación, deduplicación, intención antes
  del envío, conservación de IDs, conciliación y movimientos de acreditación/reversión
  atómicos. API administrativa con revisión auditada y bloqueo total mientras está
  deshabilitada. Núcleo incorporado a main con los 23 gates del PR #223 aprobados.
  UI administrativa con confirmación de importe/destino, historial,
  bloqueo tras respuesta perdida y revisión auditada, sin reenvío de creaciones inciertas.
  Interfaz incorporada a main con los 23 gates del PR #224 aprobados.
  Comprobantes de acreditación/reversión y avisos en cola después del commit,
  snapshots inmutables, hash de PDF, descarga por movimiento y reintentos/dead letters
  implementados; conservan el consentimiento y bloquean avisos de pagos revertidos.
  Comprobantes incorporados a main con los 23 gates del PR #225 aprobados.
  Vista previa contable administrativa implementada sobre imputaciones reales,
  con moneda explícita, notas de crédito, centavos exactos y snapshot consistente.
  Vista previa incorporada a main con los 23 gates del PR #226 aprobados.
  Generación durable implementada con confirmación/fingerprint, deduplicación,
  reserva por factura, retenciones explícitas y snapshot inmutable. Admite cobros
  suplementarios, anulación auditada previa al envío y validación de fuentes antes
  de transferir; respeta la fecha programada en Argentina. El batch ya no simula
  transferencias, tampoco en pruebas.
  Generación incorporada a main con los 23 gates del PR #227 aprobados.
  Interfaz de generación/anulación implementada con revisión de fuentes y neto,
  confirmación, recuperación por clave y descarte durable de solicitudes no registradas.
  Conserva solicitudes inciertas al recargar o fallar una lectura; sin reenvíos automáticos.
  Interfaz incorporada a main con los 23 gates del PR #228 aprobados.
  Pendiente: recuperación de deuda por cobros
  anulados después de transferir, resolución de devoluciones parciales/nuevas
  órdenes verificadas y despliegue deshabilitado.
- [ ] Verificar que ninguna integración real se invoque mientras está deshabilitada.

## Criterio de cierre

Una tarea se elimina de este archivo solo cuando existe evidencia reproducible de autorización, pruebas, observabilidad, documentación y rollback proporcionales al riesgo. Una release requiere tag/SHA/artefactos coincidentes, cero PR o ramas temporales, migraciones y verificaciones de disponibilidad verdes.
