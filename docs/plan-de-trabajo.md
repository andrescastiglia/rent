# Plan de trabajo pendiente

**Actualizado:** 2026-09-02

**Fuente:** [Auditoría integral](auditoria-integral-2026-08-27.md)

Este documento contiene solo trabajo pendiente. El historial Git conserva lo terminado y su evidencia.

## 1. Completar releases y despliegue

- [ ] Revisar las GitHub Apps instaladas y cualquier autodeploy externo; el repositorio no tiene webhooks configurados.
- [ ] Ensayar en un entorno equivalente a producción el cambio atómico y rollback de Ansible, incluidas migraciones expand/contract y smoke tests.
- [ ] Ensayar `docs/deployment/deployment.md` de punta a punta con TLS, secretos, rutas y recuperación vigentes.
- [ ] Antes del despliegue, ejecutar sobre producción el inventario y la migración asistida de referencias legadas `/uploads/properties/` a `property_images`, validando conteos y checksums.
- [ ] Crear el primer tag únicamente con `main` sincronizado, cero PR, cero heads adicionales y todos los gates verdes.

## 2. Cerrar bloqueantes P0

### Autorización y aislamiento

- [ ] Completar fixtures de dos compañías y pruebas negativas por ID ajeno para cada controlador y herramienta IA restante.

### Consistencia financiera

- [ ] Asegurar que PDF, S3, WhatsApp y proveedores se ejecuten desde outbox después del commit.

### WhatsApp seguro

- [ ] Garantizar ejecución exactamente una vez para cada herramienta mutable aprobada, incluso si el proceso cae después del efecto de dominio y antes de persistir el resultado.

## 3. Unificar contrato de producto

- [ ] Reconciliar DOCX, `raw.md` e historias; renumerar IDs duplicados y registrar aceptación/rechazo sin perder requisitos sensibles.
- [ ] Resolver mediante ADR las contradicciones de persona/roles, owner sin login, contratos alquiler/venta, `unitId`, estados e importación DOCX.
- [ ] Elegir una única arquitectura de información y navegación para web/mobile; marcar alternativas históricas como reemplazadas.
- [ ] Homologar vocabulario, permisos y contratos entre backend, web, mobile e IA.

## 4. Completar recorridos de producto

- [ ] Personas/CRM: multirrol, deduplicación, importación, perfil de interés, matching, reservas, embudo configurable, timeline, consentimiento y métricas.
- [ ] Cobros: conceptos variables editables antes de emitir, mora opcional auditada, período/vencimiento automáticos, recibo y nota de crédito persistentes.
- [ ] Contratos: carga existente, importación DOCX, versiones/PDF, alquiler/venta, IPC/ICL/Casa Propia, comisión variable, renovación y finalización.
- [ ] Propiedades: filtros útiles, interesados, visitas y aviso consentido al propietario con fecha, oferta y valor.
- [ ] Ventas: cuotas transaccionales, atrasos, saldo a favor/crédito y original/duplicado verificables.
- [ ] Mantenimiento: solicitud, asignación, seguimiento, cierre, adjuntos, auditoría y notificaciones idempotentes.
- [ ] Corregir `FT-WCAG-001..010` y validar WCAG 2.2 AA, teclado, lector de pantalla, contraste y estados de error.

## 5. Completar canales e integraciones

- [ ] Validar lectura WhatsApp por capacidad y rol con evidencia, fecha, paginación, desambiguación y deep links seguros.
- [ ] Habilitar propuestas WhatsApp por dominio solo después de cerrar inbox/outbox y la bandeja de revisión.
- [ ] Llevar MercadoPago al flujo contable común con firma, replay, idempotencia y conciliación productiva.
- [ ] Integrar proveedores reales de firma, portales y liquidaciones; definir timeout, retry, circuit breaker y reconciliación.
- [ ] Persistir PDFs con checksum, versión, autorización y regeneración controlada.

## 6. Operación, calidad y documentación

- [ ] Completar E2E con backend real en Android e iOS y conservar evidencia por plataforma.
- [ ] Validar instalación limpia y upgrade desde la versión productiva anterior con backup/restore ensayado.
- [ ] Cerrar gates RAG: integridad, recall ≥ 0,95, errores < 1 %, respuesta p95 < 8 s y frescura p95 < 60 s; conservar evidencia por tag/compañía.
- [ ] Clasificar el 100 % de `docs/` como fuente, vigente, operativo, evidencia o histórico; agregar owner, corte, estado y reemplazo.
- [ ] Alinear README, runbooks, OpenAPI, manuales y documentación en el mismo PR que cambia comportamiento.

## Criterio de cierre

Una tarea se elimina de este archivo solo cuando existe evidencia reproducible de autorización, pruebas, observabilidad, documentación y rollback proporcionales al riesgo. Una release requiere tag/SHA/artefactos coincidentes, cero PR o ramas temporales, migraciones y smoke tests verdes.
