# Plan de trabajo pendiente

**Actualizado:** 2026-09-02

**Fuente:** [Auditoría integral](auditoria-integral-2026-08-27.md)

Este documento contiene solo trabajo pendiente. El historial Git conserva lo terminado y su evidencia.

## 1. Consolidar Git y habilitar releases

- [ ] Obtener permiso de escritura para publicar la rama local `codex/main-tag-release`; GitHub responde `403` para la identidad actual.
- [ ] Integrar en `main` los cambios locales ya verificados de documentación, CI/CD, seguridad y cuentas corrientes.
- [ ] Resolver los PR #163–#166 contra `main`; integrar cambios compatibles o cerrar cada PR con justificación.
- [ ] Confirmar que ningún commit útil quede fuera de `main`; eliminar `develop`, `preview` y los heads resueltos. Dejar únicamente `main` como rama permanente local y remota.
- [ ] Cambiar el CI definitivo para aceptar PR solo hacia `main`; habilitar eliminación automática de ramas.
- [ ] Exigir en `main` PR, conversaciones resueltas, checks estables y aprobación humana cuando exista otro revisor.
- [ ] Proteger tags `vX.X.X` contra modificación o borrado y restringir su creación a responsables de release.
- [ ] Crear `production-release` restringido a tags y `production-ops` para tareas batch; revisar webhooks, GitHub Apps y autodeploys externos.
- [ ] Promover artefactos inmutables de backend, web, batch y mobile con checksums/SBOM; no recompilar en el servidor.
- [ ] Convertir Ansible a releases versionados con cambio atómico, migraciones expand/contract, smoke tests y rollback probado.
- [ ] Reescribir y ensayar `docs/deployment/deployment.md` para el flujo por tag/SHA, TLS, secretos, rutas y recuperación vigentes.
- [ ] Crear el primer tag únicamente con `main` sincronizado, cero PR, cero heads adicionales y todos los gates verdes.

## 2. Cerrar bloqueantes P0

### Autorización y aislamiento

- [ ] Propagar `actor + companyId + rol + permisos` y validar pertenencia en todas las lecturas y mutaciones restantes: tenants, properties/units, leases, payments/invoices, bank accounts, owners y staff.
- [ ] Restringir owner, tenant y buyer a objetos relacionados, no solo a la misma compañía.
- [ ] Completar el mapa de permisos de staff y sus pruebas A/B por módulo.
- [ ] Añadir fixtures de dos compañías y pruebas negativas por ID ajeno para cada controlador y herramienta IA.

### Consistencia financiera

- [ ] Asegurar que PDF, S3, WhatsApp y proveedores se ejecuten desde outbox después del commit.

### Superficies públicas y sesiones

- [ ] Autenticar y deduplicar webhooks de firma, pagos y comunicaciones; validar firma, timestamp, replay, compañía y transición de estado.
- [ ] Reemplazar uploads temporales públicos por claves opacas firmadas, límites de tamaño/tipo, cuarentena y autorización al promover/descargar.
- [ ] Aplicar rate limits distribuidos, CORS/proxy explícitos y secretos obligatorios en todos los entornos no test.

### WhatsApp seguro

- [ ] Persistir webhooks en inbox antes de responder 200; deduplicar por WAMID y procesar con lease, retry, backoff y dead-letter.
- [ ] Enviar respuestas y efectos mediante outbox transaccional e idempotencia del proveedor.
- [ ] Definir retención, borrado, redacción y presupuesto de abuso; mantener inbound productivo deshabilitado hasta cerrar estos gates.
- [ ] Mantener las propuestas inmutables, con expiración, hash, reautenticación, autorización recalculada y ejecución exactamente una vez.

## 3. Unificar contrato de producto

- [ ] Publicar un manifiesto canónico de capacidades con roles, permisos, compañía, canales, riesgo, confirmación, estado y evidencia.
- [ ] Reconciliar DOCX, `raw.md` e historias; renumerar IDs duplicados y registrar aceptación/rechazo sin perder requisitos sensibles.
- [ ] Resolver mediante ADR las contradicciones de persona/roles, owner sin login, contratos alquiler/venta, `unitId`, estados e importación DOCX.
- [ ] Elegir una única arquitectura de información y navegación para web/mobile; marcar alternativas históricas como reemplazadas.
- [ ] Publicar OpenAPI versionado, generar clientes web/mobile de forma reproducible y bloquear drift en CI.
- [ ] Homologar vocabulario, permisos y contratos entre backend, web, mobile e IA.

## 4. Completar recorridos de producto

- [ ] Personas/CRM: multirrol, deduplicación, importación, perfil de interés, matching, reservas, embudo configurable, timeline, consentimiento y métricas.
- [ ] Cobros: conceptos variables editables antes de emitir, mora opcional auditada, período/vencimiento automáticos, recibo y nota de crédito persistentes.
- [ ] Contratos: carga existente, importación DOCX, versiones/PDF, alquiler/venta, IPC/ICL/Casa Propia, comisión variable, renovación y finalización.
- [ ] Propiedades: filtros útiles, interesados, visitas y aviso consentido al propietario con fecha, oferta y valor.
- [ ] Ventas: cuotas transaccionales, atrasos, saldo a favor/crédito y original/duplicado verificables.
- [ ] Mantenimiento: solicitud, asignación, seguimiento, cierre, adjuntos, auditoría y notificaciones idempotentes.
- [ ] Implementar bandeja única “Revisar” y un Inicio orientado a tareas en web/mobile.
- [ ] Corregir `FT-WCAG-001..010` y validar WCAG 2.2 AA, teclado, lector de pantalla, contraste y estados de error.

## 5. Completar canales e integraciones

- [ ] Validar lectura WhatsApp por capacidad y rol con evidencia, fecha, paginación, desambiguación y deep links seguros.
- [ ] Habilitar propuestas WhatsApp por dominio solo después de cerrar inbox/outbox y la bandeja de revisión.
- [ ] Llevar MercadoPago al flujo contable común con firma, replay, idempotencia y conciliación productiva.
- [ ] Integrar proveedores reales de firma, portales y liquidaciones; definir timeout, retry, circuit breaker y reconciliación.
- [ ] Persistir PDFs con checksum, versión, autorización y regeneración controlada.

## 6. Operación, calidad y documentación

- [ ] Definir SLI/SLO, error budgets, on-call y alertas con pruebas de disparo/recuperación.
- [ ] Elevar cobertura mobile y E2E real: navegadores soportados, backend real, Android e iOS.
- [ ] Validar instalación limpia y upgrade desde la versión productiva anterior con backup/restore ensayado.
- [ ] Cerrar gates RAG: integridad, recall ≥ 0,95, errores < 1 %, respuesta p95 < 8 s y frescura p95 < 60 s; conservar evidencia por tag/compañía.
- [ ] Clasificar el 100 % de `docs/` como fuente, vigente, operativo, evidencia o histórico; agregar owner, corte, estado y reemplazo.
- [ ] Alinear README, runbooks, OpenAPI, manuales y documentación en el mismo PR que cambia comportamiento.

## Criterio de cierre

Una tarea se elimina de este archivo solo cuando existe evidencia reproducible de autorización, pruebas, observabilidad, documentación y rollback proporcionales al riesgo. Una release requiere tag/SHA/artefactos coincidentes, cero PR o ramas temporales, migraciones y smoke tests verdes.
