# Auditoría integral de producto y arquitectura

**Fecha de corte:** 2026-08-27

**Alcance:** documentación, backend, frontend web, aplicación mobile y canal WhatsApp con IA

**Documento relacionado:** [Plan de trabajo](plan-de-trabajo.md)

## Conclusión ejecutiva

Rent ya no es un proyecto “en planificación”. Es un producto amplio, con backend modular, web Next.js, aplicación nativa Expo/React Native, procesamiento batch, portales por rol y un circuito de WhatsApp con texto, audio, IA y propuestas de cambio. La base compila y sus pruebas automatizadas pasan.

El problema principal no es la cantidad de funcionalidad. Es que el producto carece de una fuente de verdad compartida y de un contrato único de capacidades, roles y canales. Como resultado:

- La documentación describe como futuras varias funciones que ya existen y presenta componentes aspiracionales como si fueran actuales.
- Backend, web, mobile e IA conceden capacidades distintas al mismo rol.
- La web administrativa concentra demasiados módulos y oculta las tareas que requieren atención.
- Mobile tiene una cobertura funcional relevante, pero contratos y permisos propios que ya se desviaron de web/backend.
- WhatsApp ya puede generar propuestas mutables, pero la confirmación actual no brinda información suficiente y la ejecución no garantiza exactamente una vez.
- Hay una exposición crítica de cuentas corrientes por identificador sin validación de compañía o relación del usuario.

La dirección correcta es conservar el backend como única autoridad de dominio, usar WhatsApp para consultar e iniciar propuestas, y exigir que toda mutación conversacional sea revisada y confirmada en web o mobile. Antes de ampliar esa capacidad deben cerrarse los riesgos P0 de autorización, aislamiento, idempotencia, privacidad y contratos entre canales.

## Dictamen por dimensión

### Base técnica

**Estado: sólida, con riesgos funcionales no cubiertos por la suite.**

- Type-check satisfactorio en backend, frontend, mobile y batch.
- Build satisfactorio en backend, frontend y batch.
- 162 suites y 1.302 pruebas automatizadas satisfactorias: backend 937, frontend 191, mobile 17 y batch 157.
- La cobertura backend informada por Jest es 90,01% de líneas, 89,46% de statements, 80,92% de funciones y 70,94% de branches.
- El build web genera 127 rutas, evidencia de una superficie considerable.
- El healthcheck local no pudo completarse porque la infraestructura Docker no estaba levantada; no se realizó validación contra una base real.
- La cobertura mobile es desproporcionadamente baja frente a su superficie: 17 pruebas unitarias para una aplicación con múltiples recorridos y pantallas.

Las pruebas verdes demuestran estabilidad del código probado, no coherencia de permisos, paridad de canales ni seguridad multi-tenant. Los riesgos principales encontrados no tienen pruebas de regresión que los detecten.

### Coherencia documental

**Estado: no confiable como fuente de planificación o arquitectura actual.**

El repositorio mezcla cuatro tipos de documento sin distinguirlos:

- Necesidad original y vocabulario del usuario.
- Diseño aspiracional previo a la implementación.
- Descripción parcial del estado real.
- Planes alternativos o especulativos.

La versión histórica de `docs/plan-de-trabajo.md`, evaluada en este corte y disponible en el historial de Git, debía ser reemplazada y no corregida por acumulación. Declaraba nueve fases, pero sus estados internos no permitían conocer el avance real. El README ya fue ajustado en este baseline para dejar de duplicar ese roadmap. Además:

- La Fase 0 figuraba completa, pero conservaba logging, métricas y criterios pendientes.
- Mantenimiento, CRM, reportes y portales seguían pendientes, aunque ya existían en backend y web.
- Producción y go-live aparecían pendientes, mientras `meta.md:80-103` registra publicación y operación de Meta/WhatsApp.
- Mobile aparecía como PWA pendiente y la aplicación nativa como futura, aunque el repositorio contiene una aplicación Expo activa.
- El plan histórico y `docs/functional/drf-original.md:137` usaban “WhatsApp Cloud API” como proveedor de email y SMS, contradiciendo `backend/docs/WHATSAPP.md:39-47` y la migración que deshabilita email/SMS.
- `docs/technical/arquitectura.md:30-120` presenta gateway, colas, Elasticsearch, Kubernetes y decisiones REST/GraphQL o PWA/nativo como arquitectura vigente o abierta. El runtime real es principalmente un monolito modular NestJS, PostgreSQL/pgvector, web Next.js, mobile Expo y un proceso batch.
- C4, DER y secuencias conservan `Unit`, `/leads`, DocuSign/S3 y componentes aspiracionales que no representan el modelo implementado.
- `qdrant_plan.md` propone reemplazar PostgreSQL, NestJS, backend y batch por Qdrant/Rust. No existe implementación que respalde esa dirección y contradice `rag_plan.md`, que sí evoluciona la arquitectura actual.

La documentación valiosa a preservar es la que expresa tareas reales del negocio: búsqueda de personas, cobros simples, recibos, contratos, vencimientos, cargos variables, ventas y cuotas en `docs/user/raw.md` y `docs/user/historias-de-usuario.md`.

### Backend y reglas de acceso

**Estado: funcionalmente amplio; la autorización necesita una corrección estructural.**

El backend registra módulos de autenticación, compañías, usuarios, propiedades, personas, contratos, pagos, ventas, mantenimiento, CRM, portales, documentos, reportes, IA y WhatsApp en `backend/src/app.module.ts:45-114`. Esa amplitud sí está respaldada por código.

Sin embargo, el acceso combina decoradores por controlador, guards globales, un mapa manual de rutas, permisos de staff y filtros ad hoc dentro de servicios. No hay una política canónica reutilizada por API, IA y canales.

El riesgo multiempresa no se limita a un endpoint:

- Usuarios se listan y cargan globalmente sin `companyId` en `backend/src/users/users.controller.ts:30-99` y `backend/src/users/users.service.ts:41-96`.
- Owner puede listar inquilinos, pero el controlador no pasa contexto y el servicio no filtra compañía en `backend/src/tenants/tenants.controller.ts:38-74` y `backend/src/tenants/tenants.service.ts:130-198`.
- Contratos modela un `RequestUser` sin compañía y deja admin/staff sin filtro de objeto en `backend/src/leases/leases.service.ts:48`, `:217-362` y `:1779-1812`.
- Pagos también omite compañía del contexto y carga listados/detalle sin aislamiento explícito en `backend/src/payments/payments.service.ts:31`, `:387-458` y `:545-579`.
- No existe Row Level Security como defensa secundaria. Las constraints existentes preservan relaciones, no confidencialidad.

Un caso especialmente grave y fácil de reproducir conceptualmente es cuentas corrientes:

- `TenantAccountsController` exige JWT, pero no roles ni contexto de compañía en `backend/src/payments/tenant-accounts.controller.ts:8-43`.
- `findOne`, `findByLease`, movimientos y balance consultan solo por UUID en `backend/src/payments/tenant-accounts.service.ts:70-110` y `:226-236`.
- `findByLease` puede crear una cuenta como efecto colateral de un GET en `backend/src/payments/tenant-accounts.service.ts:88-99`.
- Las mismas operaciones se exponen a todos los roles en el catálogo de IA en `backend/src/ai/openai-tools.registry.ts:1873-1929`.

Un usuario autenticado que obtenga o adivine un UUID válido podría consultar datos financieros de otra compañía o persona. Además, un GET puede generar datos. La combinación de listados, detalles y mutaciones no scoped permite lectura o modificación cruzada en varios dominios. Esto es P0 y debe corregirse antes de ampliar WhatsApp o considerar productivo el sistema multiempresa.

El guard de roles también es permisivo por defecto:

- El mapa de permisos de staff cubre solo una parte de los módulos en `backend/src/common/guards/roles.guard.ts:15-35`.
- Un staff sin permisos o con lista vacía recibe acceso completo en `backend/src/common/guards/roles.guard.ts:42-53`.
- Una ruta sin `@Roles` queda disponible para cualquier usuario autenticado en `backend/src/common/guards/roles.guard.ts:72-75`.
- Los recursos no mapeados para staff terminan permitidos en `backend/src/common/guards/roles.guard.ts:87-97`.

Existe además una escalada directa de permisos: `PATCH /users/profile/me` acepta `UpdateUserDto`, el DTO incluye `permissions` y el servicio lo persiste en `backend/src/users/users.controller.ts:58-69`, `backend/src/users/dto/update-user.dto.ts:16-29` y `backend/src/users/users.service.ts:206-208`. Un staff puede asignarse permisos a sí mismo.

Otros bloqueantes de backend:

- La confirmación de pagos modifica saldo, movimientos, facturas, notas de crédito, recibo y estado en pasos no transaccionales en `backend/src/payments/payments.service.ts:155-332`.
- `addMovement` actualiza el saldo y luego inserta el movimiento sin transacción ni idempotencia en `backend/src/payments/tenant-accounts.service.ts:123-152`.
- Si falta `JWT_SECRET`, la aplicación usa el literal `secret`, y la estrategia no rechaza usuarios desactivados en `backend/src/auth/strategies/jwt.strategy.ts:13-28`.

La política objetivo debe ser negar por defecto y resolver siempre `actor + compañía + entidad + acción + canal`, también dentro del servicio de dominio y no solo en el controlador.

### Roles y permisos

**Estado: cinco roles implementados, sin matriz canónica.**

El código define `admin`, `staff`, `owner`, `tenant` y `buyer` en `backend/src/users/entities/user.entity.ts:13-19`. Las discrepancias observadas incluyen:

- Buyer existe en backend y web types, pero no tiene navegación web ni mobile. Después del login web cae en dashboard, cuyo layout no acepta buyer.
- Web oculta propiedades, inquilinos y contratos a staff en `frontend/src/config/navigation.ts:28-55`, aunque layouts o backend sí permiten parte de esas capacidades.
- Web muestra CRM e informes a owner, pero sus layouts no aceptan owner en algunas rutas.
- El prompt de IA niega a owner capacidades de CRM que frontend y backend sí conceden.
- Mobile no modela buyer ni permisos modulares de staff en `mobile/src/types/auth.ts` y `mobile/src/config/navigation.ts`.
- El layout mobile protege autenticación, no autorización por ruta; un deep link puede abrir una pantalla que el menú ocultó.
- Las claves de permisos de staff omiten mantenimiento, comunicaciones, conciliación, liquidaciones y aprobación de propuestas.

Ocultar un enlace no constituye autorización. Se necesita una matriz central y pruebas de contrato por rol/capacidad/canal.

### Frontend web

**Estado: amplio y visualmente consistente, pero organizado alrededor de módulos, no de tareas.**

La inspección en navegador se realizó en escritorio y en viewport móvil de 390 × 844.

Aspectos favorables:

- El acceso es sencillo, tiene etiquetas accesibles y selector de idioma.
- El layout responde correctamente al ancho móvil y reemplaza la barra lateral por un menú.
- El portal de propietario es la experiencia más clara: resumen corto, cuatro indicadores, dos propiedades y tres destinos inferiores. Es un buen patrón para los demás roles.
- Los estados vacíos usan lenguaje comprensible.

Problemas de usabilidad:

- El panel administrativo ofrece 12 destinos de primer nivel. Para una persona no técnica no expresa qué debe hacer primero.
- La pantalla inicial combina “Actividades de personas”, propiedades y pagos en una página larga, con dos bloques llamados “Panel principal”.
- La prioridad se expresa por módulos y colores, no por una bandeja única de tareas accionables.
- En móvil responsive las tarjetas se apilan y la página se vuelve muy extensa; no existe navegación inferior equivalente a la claridad del portal de propietario.
- Terminología como pagos, cobros, liquidaciones, facturas y comprobantes no es canónica entre documentación, UI e IA.
- La cobertura mock es incompleta: el dashboard y reportes todavía pueden llamar APIs reales, y el asistente aparece deshabilitado en el entorno de demostración. Esto reduce la confiabilidad de E2E y de las revisiones de UX.

La suite Axe pasó 20/20 rutas en Chromium desktop, pero no debe interpretarse como conformidad completa: solo prueba un perfil admin, no incluye viewport mobile, Firefox/WebKit ni tecnologías asistivas, y algunas rutas registraron `Unauthorized` por mocks incompletos. Puede estar auditando estados vacíos o de error en lugar del contenido real.

Confirmación de IA actual:

- Las propuestas aparecen mezcladas con comunicaciones dentro de “Actividades de personas”.
- Aprobar usa `window.confirm` y rechazar/responder usa `window.prompt` en `frontend/src/app/[locale]/dashboard/page.tsx:149-169`.
- El backend entrega tipo, entidad y resumen, pero no payload, valor actual, valor propuesto ni conflictos en `backend/src/dashboard/dashboard.service.ts:742-792`.
- El panel conversacional web solo muestra texto; no representa una propuesta ni su estado en `frontend/src/components/ai/AiAssistantPanel.tsx:254-307`.

Por lo tanto, la confirmación existe técnicamente pero no es informada, segura ni adecuada para un usuario no técnico.

### Aplicación mobile

**Estado: aplicación nativa real, con paridad parcial y contratos desviados.**

Mobile no debe seguir documentándose como PWA o trabajo futuro. Ya incluye propiedades, personas, contratos, pagos, facturas, CRM, usuarios, plantillas, reportes, ventas y asistente, además de flujos E2E propios.

Las brechas principales son:

- `mobile/src/types/auth.ts` omite buyer y permisos modulares.
- `mobile/src/config/navigation.ts` omite buyer, mantenimiento, ventas y varias capacidades presentes en pantallas.
- `mobile/src/api/dashboard.ts:88-112` solo tipa actividad vencida/hoy y fuentes interesado/propietario; el backend también devuelve `new` y propuestas pendientes.
- `mobile/app/(app)/(tabs)/dashboard.tsx:393-402` no muestra tareas nuevas ni aprobaciones.
- El asistente mobile solo intercambia texto en `mobile/app/(app)/(tabs)/ai.tsx:82-125`; no muestra una propuesta, diff, riesgo o enlace de confirmación.
- El layout autenticado en `mobile/app/(app)/_layout.tsx` no valida el rol de cada pantalla.
- Los DTO se duplican manualmente entre web y mobile. La divergencia del dashboard demuestra que esa estrategia ya falló.
- Reportes mobile es todavía un placeholder en `mobile/app/(app)/reports.tsx:1-13`; tampoco hay bandeja de comunicaciones/propuestas, portales owner/tenant equivalentes ni workflow completo de mantenimiento.
- Los controles base `AppButton`, `Field`, `DateField` y `ChoiceGroup` no exponen de forma sistemática `accessibilityRole`, `accessibilityLabel` o `accessibilityState` en `mobile/src/components/ui.tsx:25-248`.

La paridad objetivo no debe significar copiar todas las pantallas. Debe significar que cada tarea crítica puede completarse con seguridad desde web y mobile, con el mismo vocabulario, alcance y estado.

### WhatsApp e IA

**Estado: base valiosa ya operativa, no lista para expansión irrestricta.**

La implementación actual ya contiene buenas decisiones:

- Solo procesa mensajes de un usuario activo, con teléfono único asociado y opt-in explícito en `backend/src/whatsapp/whatsapp.service.ts:354-381`.
- Soporta texto y audio/transcripción en `backend/src/whatsapp/whatsapp.service.ts:388-432` y `:469-513`.
- Usa contexto de rol y relaciones para recuperación en `backend/src/ai/rag/ai-rag-rollout.service.ts:87-152`.
- En WhatsApp, una mutación se encola como propuesta para staff en lugar de ejecutarse directamente.
- Existen tablas de confirmaciones, propuestas y mensajes en `migrations/099_add_whatsapp_inbox_and_pending_actions.sql:45-137`.

Pero “toda la funcionalidad por WhatsApp” todavía no se cumple:

- Owner, tenant y buyer quedan limitados casi exclusivamente a herramientas de perfil en `backend/src/ai/ai-tools-registry.service.ts:631-637`.
- El contexto RAG externo cubre pocas relaciones y no garantiza pagos, facturas, liquidaciones, mantenimiento, documentos o ventas completos.
- El catálogo contiene 173 definiciones y OpenAI recibe como máximo 128; la selección por ranking recorta herramientas en `backend/src/ai/ai-tools-registry.service.ts:620-668`.
- `ALL_ROLES` omite buyer en `backend/src/ai/openai-tools.registry.ts:168-177`, agregando otra divergencia de cobertura.
- El catálogo incluye endpoints técnicos o impropios para un asistente, como login, registro, webhooks y herramientas internas. “Exponer todos los endpoints” no equivale a ofrecer capacidades seguras.
- No hay una prueba sistemática de fuga entre compañías/roles ni de cobertura de preguntas por dominio.
- Interesados o contactos sin identidad de login quedan fuera, aunque comunicaciones soporta personas interesadas.

Riesgos del webhook:

- El controlador responde 200 y procesa en segundo plano sin persistir primero una recepción durable en `backend/src/whatsapp/whatsapp.controller.ts:70-86`.
- Un error posterior puede perder el mensaje sin que Meta reintente.
- Se registran teléfono y cuerpo entrante en logs en `backend/src/whatsapp/whatsapp.service.ts:354-381`.
- No se observó una política completa de rate limit, presupuesto, retención o borrado para texto, audio y transcripción.

Riesgos de aprobación:

- `PendingActionsService.approve` hace un update condicional, pero no comprueba filas afectadas antes de ejecutar en `backend/src/ai/pending-actions.service.ts:44-80`. Dos aprobadores concurrentes podrían ejecutar la misma acción.
- `executeApproved` verifica admin/staff, pero no vuelve a evaluar el permiso del módulo o entidad en `backend/src/ai/ai-tool-executor.service.ts:106-127`.
- Las propuestas no tienen vencimiento, versión de entidad, hash de precondiciones ni clave de idempotencia.
- El payload crudo de una propuesta se persiste sin la misma redacción aplicada a confirmaciones en `backend/src/ai/ai-tool-executor.service.ts:231-266`.
- No se aplica separación entre quien propone y quien aprueba para operaciones de alto riesgo.

## Modelo de canales recomendado

La frase “toda la funcionalidad por WhatsApp” debe implementarse como paridad de capacidad, no como réplica de cada formulario dentro del chat.

### Backend

Es la única autoridad para políticas, validaciones y mutaciones. Web, mobile e IA llaman los mismos casos de uso de dominio.

### Web y mobile

Son superficies equivalentes por capacidad. Muestran contexto completo, permiten edición rica y son los únicos canales habilitados para confirmar una propuesta originada por WhatsApp.

### WhatsApp

Permite:

- Descubrir qué se puede hacer.
- Consultar información permitida por rol y relación.
- Explicar resultados con fecha, alcance y evidencia.
- Reunir datos faltantes mediante conversación.
- Crear una propuesta de cambio.
- Entregar un deep link seguro a web/mobile para revisar.
- Informar el resultado luego de la ejecución.

No permite:

- Confirmar o ejecutar la mutación dentro de WhatsApp.
- Saltar políticas del servicio de dominio.
- Entregar datos fuera de compañía, rol o relación.
- Hacer cambios implícitos mediante una herramienta marcada como lectura.

Operaciones visuales o masivas —diseñar una plantilla, importar un archivo o revisar muchos cambios— pueden iniciarse y explicarse por WhatsApp, pero se completan mediante un enlace profundo en el frontend.

## Modelo de aprobación recomendado

Cada propuesta debe ser inmutable y contener:

- Actor solicitante, compañía, rol y canal.
- Conversación/mensaje de origen.
- Caso de uso de negocio, no nombre de endpoint.
- Entidad y versión leída.
- Valores actuales y propuestos, con diff entendible.
- Validaciones, impacto y nivel de riesgo.
- Política que determina quién puede aprobar.
- Vencimiento, hash y clave de idempotencia.
- Estado y resultado auditables.

Estados mínimos:

`NEEDS_INFO → PENDING_APPROVAL → APPROVING → EXECUTED`

Salidas terminales: `REJECTED`, `EXPIRED`, `CONFLICT` y `FAILED`.

Al aprobar, el backend debe abrir una transacción, bloquear o reclamar atómicamente la propuesta, volver a evaluar permisos y precondiciones, ejecutar una sola vez, registrar auditoría/outbox y luego notificar. Una aprobación financiera, contractual o destructiva debe exigir autenticación reforzada y, cuando corresponda, un aprobador distinto del solicitante.

## Experiencia objetivo para personas no técnicas

La interfaz debe partir de la pregunta “¿qué necesita hacer esta persona hoy?” y no de la estructura interna del backend.

Principios:

- Una acción primaria clara por pantalla.
- Inicio por rol con tareas, alertas y accesos frecuentes.
- Máximo de cinco grupos principales; el resto bajo “Más” o búsqueda.
- Lenguaje del negocio validado con usuarios reales.
- Formularios guiados, buenos valores por defecto y revelado progresivo.
- Búsqueda global por persona, dirección, contrato o comprobante.
- Errores que expliquen qué ocurrió y cómo continuar.
- Borradores, deshacer cuando sea posible y prevención de duplicados.
- Web responsive y mobile nativo con el mismo orden conceptual.
- WCAG 2.2 AA, targets táctiles adecuados, lector de pantalla, foco y contraste verificados.

Primeros recorridos a optimizar:

1. Buscar una persona por apellido y entender su situación.
2. Registrar un cobro y emitir/compartir el comprobante.
3. Ver contrato, vencimiento y próximos pasos.
4. Gestionar propiedad, visita e interesado.
5. Registrar una cuota de venta y entregar comprobante.
6. Revisar y confirmar una propuesta iniciada por WhatsApp.

## Prioridades

### P0 — antes de ampliar el uso productivo de IA mutable

- Corregir aislamiento y autorización de cuentas corrientes.
- Incorporar `companyId` y scope de objeto a usuarios, inquilinos, contratos, pagos y el resto de servicios; agregar pruebas empresa A/empresa B.
- Eliminar `permissions` del perfil propio y cerrar la escalada de staff.
- Adoptar autorización deny-by-default y política central por caso de uso.
- Hacer aprobación transaccional, idempotente, expirable y con permisos revalidados.
- Transaccionar la confirmación financiera y hacer movimientos/recibos idempotentes.
- Exigir `JWT_SECRET`, rechazar usuarios inactivos y definir revocación de sesiones.
- Redactar/cifrar payloads sensibles y definir retención.
- Persistir webhook antes de responder; agregar inbox/outbox durable.
- Crear matriz canónica de roles, relaciones, permisos y canales.
- Reemplazar confirmación genérica por una bandeja segura en web y mobile.
- Resolver buyer y deep links no autorizados.
- Congelar como solo lectura las mutaciones conversacionales que no cumplan estos gates.

### P1 — coherencia y usabilidad

- Simplificar navegación y dashboard alrededor de tareas.
- Generar contratos/SDK desde OpenAPI para web y mobile.
- Definir glosario y estados canónicos.
- Crear un manifiesto de capacidades por rol/canal.
- Repetir auditoría WCAG y hacer pruebas moderadas con personas no técnicas.
- Enrutar IA por dominio/caso de uso, no por catálogo plano de endpoints.
- Completar consultas WhatsApp con evidencia y pruebas anti-fuga.
- Actualizar privacidad para mensajes entrantes, audio, transcripción e IA.

### P2 — expansión e integraciones

- Conciliación y proveedor de pagos productivo.
- Firma digital, ARCA y sincronizaciones solo después de validar prioridad de negocio.
- Reportes avanzados y automatizaciones adicionales.
- Archivar o convertir `qdrant_plan.md` en ADR rechazado mientras no exista una decisión formal.

## Decisiones de producto pendientes

El nuevo plan puede avanzar con supuestos provisionales, pero estas decisiones deben quedar cerradas y versionadas:

1. Si `User` representa solo identidad autenticada o también contacto de negocio.
2. Cómo se vinculan y desvinculan teléfonos, compañías y roles en WhatsApp.
3. Si interesados sin login pueden usar WhatsApp y qué información reciben antes de verificar identidad.
4. Qué módulos puede operar/aprobar cada staff y qué significa una lista vacía de permisos.
5. Quién confirma propuestas de owner, tenant y buyer según riesgo.
6. Si alguien puede aprobar su propia propuesta.
7. Glosario de cobro, pago, liquidación, factura, recibo, comprobante y cuota.
8. Máquina de estados de contrato y firma.
9. Retención y tratamiento de mensajes, audios, transcripciones, prompts, documentos y auditoría.
10. Prioridad real de Mercado Pago, conciliación, firma, ARCA y sincronización de portales.

## Definition of Done transversal

Una capacidad solo se considera terminada cuando incluye:

- Regla de dominio y API con aislamiento por compañía/persona.
- Autorización probada para los cinco roles y permisos de staff.
- Recorrido simple en web y mobile, o justificación explícita de canal no aplicable.
- Consulta o inicio por WhatsApp cuando corresponda.
- Propuesta y confirmación web/mobile para toda mutación conversacional.
- Auditoría, idempotencia y recuperación ante error.
- Accesibilidad, i18n y lenguaje comprensible.
- Pruebas de contrato, integración y E2E por rol/canal.
- Observabilidad sin datos personales innecesarios.
- Documentación canónica actualizada en la misma entrega.

## Métricas de éxito sugeridas

- Al menos 90% de finalización de tareas críticas en pruebas moderadas con personas no técnicas.
- Búsqueda de persona/contrato en menos de 15 segundos.
- Registro de cobro habitual en menos de 60 segundos, sin asistencia.
- Revisión de una propuesta de bajo riesgo en menos de 60 segundos.
- Cero accesos cruzados entre compañía, rol o relación en pruebas automatizadas.
- 100% de mutaciones iniciadas en WhatsApp convertidas en propuestas auditables.
- Cero ejecuciones duplicadas ante reintentos o aprobaciones concurrentes.
- 100% de capacidades P0 con paridad definida y validada en web/mobile.
- 100% de respuestas WhatsApp sensibles con evidencia y evaluación de alcance.

## Fuente de verdad a partir de esta auditoría

- Este documento registra el baseline y los riesgos a la fecha de corte.
- `docs/plan-de-trabajo.md` es el único roadmap de producto vigente.
- `rag_plan.md` puede mantenerse como workstream técnico subordinado.
- Arquitectura, C4, DER, secuencias y DRF originales son antecedentes hasta que se reescriban como “as-is”.
- `qdrant_plan.md` no debe usarse para ejecutar trabajo sin una decisión de arquitectura explícita.
