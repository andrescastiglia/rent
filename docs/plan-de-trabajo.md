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
  Pendiente: gates/despliegue de esta corrección y los demás dominios.

### Consistencia financiera

- [ ] Asegurar que PDF, WhatsApp y proveedores se ejecuten desde outbox después del commit.
  Avance: confirmación de pagos y conciliación bancaria usan `payment_effects_outbox`
  (migración 111), con documentos y entregas atómicos, reintentos y dead letters.
  Ver [operación y pruebas](technical/payments.md#efectos-recuperables-de-confirmación).
  Ventas guarda cobro y `sale_receipt_effects_outbox` juntos (migración 112),
  con PDF recuperable, descarga autenticada y pruebas de concurrencia/rollback.
  Pendiente: verificar los demás productores de documentos/proveedores y desplegar.

### WhatsApp seguro

- [ ] Garantizar ejecución exactamente una vez para cada herramienta mutable aprobada, incluso si el proceso cae después del efecto de dominio y antes de persistir el resultado.

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
  deshabilitada. Pendiente: validar gates; generación durable, recibos/notificaciones,
  UI administrativa, resolución de devoluciones parciales/nuevas órdenes verificadas
  y despliegue deshabilitado.
- [ ] Verificar que ninguna integración real se invoque mientras está deshabilitada.

## Criterio de cierre

Una tarea se elimina de este archivo solo cuando existe evidencia reproducible de autorización, pruebas, observabilidad, documentación y rollback proporcionales al riesgo. Una release requiere tag/SHA/artefactos coincidentes, cero PR o ramas temporales, migraciones y verificaciones de disponibilidad verdes.
