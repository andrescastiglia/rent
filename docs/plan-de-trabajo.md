# Plan de trabajo — pendientes de producto, seguridad y operación

**Vigencia:** desde 2026-08-27

**Última revalidación:** 2026-09-02 contra `5105768` (`origin/main`), el worktree local y el estado de GitHub

**Estado:** vigente

**Responsable:** producto e ingeniería

**Consolida y reemplaza:** los dos planes anteriores, archivados en el historial de Git

**Baseline:** [Auditoría integral 2026-08-27](auditoria-integral-2026-08-27.md)

Este documento contiene únicamente trabajo pendiente. Las capacidades que la auditoría verificó como existentes —aunque deban endurecerse, integrarse mejor o validarse por canal— no se vuelven a planificar como desarrollos desde cero.

Quedan fuera hasta que exista una necesidad de negocio y un ADR aprobado: Kubernetes, Elasticsearch, Stripe, PayPal, cripto, Qdrant y una reescritura en Rust. No son pendientes comprometidos.

## 0. Resultado de la revalidación 2026-09-02

La auditoría de este corte confirma que el plan sigue siendo necesario, pero agrega dependencias que no estaban explicitadas y corrige prioridades.

### Estado Git y release observado

- GitHub tiene `main` como rama por defecto y protegida en `5105768`; el checkout local está en `develop` (`08aaa77`) y contiene cambios sin commit que deben preservarse antes de cualquier migración de ramas.
- `develop` y `preview` no tienen commits exclusivos: ambos son ancestros de `main`. Aun así, no deben eliminarse hasta resolver los PR, volver a consultar el remoto y demostrar que no existe ningún commit aceptado fuera de `main`.
- Existen cuatro PR abiertos contra `develop`: [#163](https://github.com/andrescastiglia/rent/pull/163), [#164](https://github.com/andrescastiglia/rent/pull/164), [#165](https://github.com/andrescastiglia/rent/pull/165) y [#166](https://github.com/andrescastiglia/rent/pull/166). Todos están `UNSTABLE` por el mismo scan de la imagen PostgreSQL; el corte detectó tres CVE `HIGH` corregibles en Alpine y ocho en el binario `gosu` compilado con Go 1.26.5.
- El remoto tiene siete heads vivos: `main`, `develop`, `preview` y los cuatro heads de Dependabot. No existen tags ni GitHub Releases.
- `.github/workflows/ci.yml` despliega backend/web/batch ante cualquier push a `main`; `.github/workflows/eas.yml` publica Android ante push a `main` y también permite un despacho manual equivalente. Ninguno cumple el release por tag solicitado.
- El deploy actual toma nuevamente la rama `main` en Ansible, no el SHA/tag que fue validado. Además, el job de producción no depende del scan de imagen, CodeQL, SonarQube ni Detox; Detox está marcado `continue-on-error` y el build web en CI está comentado.
- Dependabot apunta a `develop` en todos los ecosistemas y CI solo ejecuta validaciones de PR dirigidos a `preview` o `develop`. El ruleset de `main` exige PR, pero no exige aprobaciones, conversaciones resueltas ni checks concretos.

### Correcciones de alcance y prioridad

- Type-check y las 1.302 pruebas unitarias pasan en los cuatro paquetes (backend 937, frontend 191, batch 157, mobile 17), pero esos verdes no cubren aislamiento A/B, fallas transaccionales, webhooks hostiles, backend real web, iOS ni gran parte de la app mobile. Son baseline, no criterio de cierre.
- Inbox durable, deduplicación, outbox, redacción y retención mínima de WhatsApp pasan a Etapa 0. Mientras no existan, el inbound productivo debe permanecer deshabilitado; mientras no exista la bandeja segura de Etapa 2, ninguna propuesta puede ejecutarse.
- Los documentos fuente contienen requisitos concretos de cobros, cuotas, visitas, contratos, documentos y CRM que el plan resumía demasiado. Se incorporan como criterios a inventariar y validar, no como desarrollos supuestamente inexistentes.
- El contrato generado para web/mobile, mencionado en el backlog, pasa a tener tareas y gate propios en Etapa 1.
- La documentación operativa de setup y despliegue está desactualizada y, en algunos puntos, es insegura o contradictoria. Debe reescribirse y probarse antes del primer release por tag.
- Los SLO históricos, la arquitectura de navegación y los modelos de persona/contrato se contradicen entre documentos. No se hereda ninguno por omisión: deben decidirse, registrarse y marcarse como vigente, reemplazado o rechazado.

## 1. Norte del producto

Rent debe permitir que una persona con poca experiencia en sistemas complete las tareas inmobiliarias habituales sin conocer la estructura interna del negocio ni del software.

La misma capacidad debe sentirse coherente en tres superficies:

- **Web:** operación completa, tareas masivas y configuración.
- **Mobile nativo:** operación diaria, consulta, captura en campo y confirmaciones.
- **WhatsApp con IA:** consulta conversacional e inicio de cualquier acción permitida.

El backend es la única autoridad para datos, políticas y cambios. WhatsApp nunca confirma ni ejecuta una mutación. Toda acción iniciada allí termina en una propuesta revisable y requiere confirmación explícita desde web o mobile.

## 2. Qué significa “toda la funcionalidad por WhatsApp”

La paridad conversacional se define por capacidad, no por cantidad de endpoints ni por intentar reproducir formularios complejos dentro del chat.

Para cada capacidad aplicable, WhatsApp debe permitir:

1. Descubrirla en lenguaje natural.
2. Consultar su estado según rol, compañía y relación con los datos.
3. Explicar la respuesta con evidencia y fecha.
4. Reunir datos faltantes y resolver ambigüedades.
5. Crear una propuesta de cambio, si el rol puede solicitarla.
6. Entregar un deep link seguro para revisar en web/mobile.
7. Informar ejecución, rechazo, vencimiento o conflicto.

Una tarea visual, masiva o documental puede iniciarse por WhatsApp y continuar en una pantalla específica. Ejemplos: importar contratos, diseñar plantillas, comparar muchos registros o adjuntar documentación compleja.

## 3. Invariantes no negociables

### Seguridad y datos

- Toda query y command recibe `userId`, `companyId`, rol, permisos, canal y nivel de autenticación.
- Toda lectura aplica compañía, permiso y relación con el objeto.
- Toda autorización niega por defecto.
- Ocultar navegación nunca reemplaza una validación backend.
- El asistente recibe solo los campos necesarios para responder.
- Login, registro, health, webhooks, tests y transportes internos no son herramientas de negocio de IA.
- No se registran mensajes, teléfonos, tokens, contraseñas ni payloads sensibles sin redacción y política de retención.

### Mutaciones conversacionales

- WhatsApp solo crea propuestas; nunca ejecuta ni confirma.
- Una propuesta es inmutable, expira y tiene versión, hash e idempotency key.
- El aprobador vuelve a autenticarse según riesgo.
- La autorización se recalcula al aprobar.
- La entidad se relee y sus precondiciones se comparan antes de ejecutar.
- La ejecución es transaccional y ocurre exactamente una vez.
- Efectos externos usan outbox y una idempotency key del proveedor.
- El resultado se audita y se comunica al solicitante.

### Producto y experiencia

- Una pantalla tiene una acción primaria evidente.
- La navegación principal tiene como máximo cinco grupos conceptuales.
- El inicio responde “qué requiere mi atención hoy”.
- Web y mobile usan el mismo vocabulario y orden mental.
- El usuario ve nombres y consecuencias, no UUID, enums o nombres de endpoints.
- Toda operación riesgosa muestra un resumen antes de confirmar.
- Accesibilidad WCAG 2.2 AA y soporte de lector de pantalla forman parte de Definition of Done.

### Ingeniería y documentación

- API, web, mobile e IA invocan los mismos casos de uso y políticas.
- Los clientes web/mobile se generan desde un contrato versionado.
- Agregar una capacidad obliga a clasificar roles, canales, riesgo y aprobación.
- No se marca “terminado” sin evidencia por rol y canal.
- La documentación se actualiza en la misma entrega que el código.

### Git, CI/CD y releases

- `main` es la única rama permanente local y remota. Las ramas de trabajo existen solo mientras haya un PR, parten de `main` y se eliminan automáticamente al resolverlo.
- Un merge o push a `main` valida, pero nunca despliega ni publica mobile.
- Producción se despliega únicamente por un tag nuevo, inmutable y exacto `vMAJOR.MINOR.PATCH`, creado sobre un commit alcanzable desde `origin/main` y con todos los gates requeridos verdes.
- Antes del primer tag se resuelven todos los PR abiertos y se reconcilian todos los branches. Al momento de cualquier release no puede quedar un PR abierto ni un head remoto distinto de `main`.
- El tag, el checkout, los artefactos, las migraciones, el deploy y la evidencia de release refieren al mismo SHA. Nunca se reconstruye desde una rama móvil ni se reutiliza o mueve un tag publicado.
- Un fallo de seguridad, build, test, migración, smoke test o aprobación de environment bloquea el deploy. Un `workflow_dispatch` solo puede reintentar un tag existente y no crear una vía alternativa a producción.
- Cada release conserva versión, SHA, artefactos, checks, aprobación, resultado de migraciones y smoke tests, y procedimiento probado de rollback.

## 4. Modelo operativo del plan

Este plan abandona las listas históricas de cientos de tareas y story points sin evidencia. El trabajo se entrega en recorridos verticales verificables.

Cada capacidad se registra en un manifiesto canónico con una forma equivalente a:

```yaml
id: payment.register
actor_goal: Registrar un cobro y entregar comprobante
roles: [admin, staff]
permissions: [payments.write]
scope: company
channels:
  web: complete
  mobile: complete
  whatsapp_read: supported
  whatsapp_propose: supported
confirmation_policy: staff_review
risk: financial
owner: payments-team
status: validated
evidence:
  - contract-test
  - web-e2e
  - mobile-e2e
  - whatsapp-eval
```

Estados permitidos:

- **Inventariada:** existe necesidad o implementación, sin contrato validado.
- **Parcial:** algún canal o regla está implementado.
- **Implementada:** código completo, todavía sin validación integral.
- **Validada:** cumple Definition of Done y pasó pruebas por rol/canal.
- **Productiva:** observada en producción con métricas y rollback.
- **Bloqueada:** depende de una decisión explícita registrada.

Ningún estado se deriva de que exista una ruta o archivo.

## 5. Matriz provisional de actores

La matriz definitiva es el primer entregable. Mientras tanto se trabaja con estos límites conservadores.

### Admin

- Administra una compañía, no todo el sistema por omisión.
- Gestiona usuarios, permisos, configuración y operaciones de alto riesgo.
- Puede aprobar según permiso; no se asume que pueda aprobar su propia propuesta.

### Staff

- Solo accede a módulos y acciones concedidos explícitamente.
- Una lista vacía significa sin acceso adicional, nunca acceso total.
- Puede operar o aprobar según permisos separados.

### Owner

- Consulta exclusivamente propiedades, contratos, liquidaciones, documentos, comunicaciones y mantenimiento propios.
- Puede proponer cambios propios o solicitudes operativas.
- Confirma cambios personales de bajo riesgo; cambios financieros/contractuales requieren revisión autorizada.

### Tenant

- Consulta exclusivamente contrato, cuenta, cobros, facturas, recibos, documentos y mantenimiento propios.
- Puede proponer mantenimiento, actualización propia o entrega de información.
- No modifica directamente estados financieros o contractuales.

### Buyer

- Consulta exclusivamente acuerdos, cuotas, recibos, documentos y gestiones propias.
- Tiene portal, navegación y contexto IA explícitos.
- Sus propuestas siguen la misma política de riesgo que tenant/owner.

### Interested/contact

- No es automáticamente una identidad autenticada.
- Antes de entregar datos sensibles se exige vinculación verificable.
- El alcance por WhatsApp y la transición a buyer/tenant quedan como decisión de producto de la Etapa 1.

## 6. Políticas de confirmación

Todas las propuestas originadas en WhatsApp se confirman en frontend. La política determina quién puede hacerlo.

### `same_actor`

Para cambios propios, reversibles y de bajo riesgo. El solicitante abre un enlace autenticado en web/mobile, revisa y confirma.

### `staff_review`

Para solicitudes que un rol externo puede iniciar pero no ejecutar. Un staff con permiso del módulo revisa y confirma.

### `dual_control`

Para dinero, cuentas bancarias, usuarios/permisos, contratos, eliminaciones y seguridad. El aprobador debe ser distinto del solicitante y tener autenticación reforzada.

La política no se decide en el prompt. Es un atributo versionado del command de negocio.

## 7. Arquitectura objetivo

Flujo de lectura:

```text
Web / Mobile / WhatsApp
        ↓
Query de negocio + ActorContext
        ↓
Policy central → scope por compañía/objeto → minimización
        ↓
Respuesta estructurada + evidencia
```

Flujo de cambio iniciado por WhatsApp:

```text
Mensaje texto/voz
        ↓
Inbox durable → identidad/consentimiento → intención
        ↓
Command draft → validación → ActionProposal inmutable
        ↓
Deep link y notificación a Web/Mobile
        ↓
Diff + impacto + reautorización + confirmación
        ↓
Claim atómico → command idempotente → auditoría/outbox
        ↓
Resultado en Web/Mobile y WhatsApp
```

El catálogo de IA se organiza por dominios y casos de uso. Primero se selecciona dominio, rol e intención; luego se exponen pocas queries/commands relevantes. Se elimina la dependencia de un catálogo plano mayor al límite de herramientas del proveedor.

## 8. Arquitectura de información objetivo

### Admin y staff

La navegación principal se reduce a:

1. **Inicio:** tareas, riesgos, próximos vencimientos y accesos frecuentes.
2. **Personas:** interesados, propietarios, inquilinos, compradores y comunicaciones.
3. **Propiedades y contratos:** inventario, visitas, contratos, renovaciones y mantenimiento.
4. **Dinero:** cobros, facturas, liquidaciones, cuotas, cuentas y conciliación.
5. **Más:** reportes, plantillas, usuarios y configuración, filtrados por permiso.

“Revisar” tiene acceso persistente y badge en header/mobile; puede ser tab principal mientras existan tareas pendientes.

### Owner, tenant y buyer

Se toma el portal de propietario actual como patrón: resumen breve, pocas acciones y navegación inferior estable.

- Inicio.
- Bienes/contratos o acuerdo.
- Dinero/documentos.
- Solicitudes/revisiones.
- Más/perfil.

### Pantalla Inicio

Orden recomendado:

1. “Para hacer hoy”.
2. “Necesita atención”.
3. Tres acciones frecuentes según rol.
4. Resumen breve de negocio.
5. Actividad reciente.

No se mezclan múltiples “paneles principales” ni grandes tablas vacías.

### Patrones de interacción

- Búsqueda global por apellido, teléfono, dirección, contrato o comprobante.
- Cards en mobile; tablas a partir de breakpoint desktop.
- Formularios largos divididos en pasos con resumen final.
- Opciones infrecuentes bajo “Avanzado”.
- Autosave de borrador y prevención de duplicados.
- Vacío con siguiente acción; error con explicación y reintento.
- Estados y roles traducidos a lenguaje de negocio.

## 9. Etapas de entrega

Las duraciones son ventanas orientativas y deben recalibrarse después del inventario. Los gates son obligatorios; las fechas no justifican saltarlos.

### Etapa -1 — consolidación Git y release por tag

**Objetivo:** llegar de forma recuperable a una única rama permanente `main` y eliminar cualquier despliegue provocado por branches.

**Ventana orientativa:** inmediata, antes de continuar el roadmap o crear el primer tag.

**Regla de transición:** se congela el deploy productivo y la creación automática de nuevos PR hasta terminar el inventario. No se borra un branch, se cierra un PR ni se crea el primer tag sin registrar antes su decisión y demostrar que no se pierde trabajo aceptado.

Preparación y preservación:

- [ ] Actualizar y podar referencias; guardar SHA de cada head local/remoto, merge-base, ahead/behind, PR asociado, autor y última actividad.
- [ ] Preservar el worktree local sucio —incluidos este plan, README y la auditoría— en commits revisables o un respaldo verificable antes de cambiar de branch.
- [ ] Crear una matriz branch/PR → `integrar`, `reemplazar` o `cerrar`, con motivo, dueño y evidencia; “cerrado” no equivale a “resuelto” sin esa decisión.
- [ ] Pausar Dependabot durante la ventana o cambiar primero su target para que no regenere branches contra `develop`.

Corrección del pipeline, mediante un cambio transitorio validado:

- [ ] Como el CI vigente no escucha PR hacia `main`, validar primero el cambio en un PR efímero hacia `develop`; promover el mismo cambio, sin agregar contenido, por `preview` y luego `main`, revalidando cada SHA/merge resultante. Antes de cada merge comprobar que el workflow nuevo ya impide los deploy por push. Esta es la última promoción por ramas largas.
- [ ] Hacer que CI valide `pull_request` hacia `main` y push a `main`, sin ejecutar deploy, submit ni OTA.
- [ ] Separar CI de CD; el único trigger productivo será un tag que además pase una validación estricta `^v[0-9]+\.[0-9]+\.[0-9]+$`.
- [ ] Cambiar los seis targets de `.github/dependabot.yml` de `develop` a `main` y habilitar eliminación automática del head al resolver el PR.
- [ ] Eliminar de EAS los releases por push a `main`/`preview` y el bypass manual; build, submit y OTA productivos deben usar el tag y SHA validados.
- [ ] Hacer que Ansible reciba y verifique el tag/SHA inmutable, en vez de volver a leer `main`; registrar esa versión en health/version y en el resumen de deploy.
- [ ] Convertir en bloqueantes el scan de imagen, CodeQL, lint/type-check/format, builds, tests unitarios, integración/E2E, SonarQube cuando esté disponible y mobile E2E. Quitar `continue-on-error` de cualquier gate requerido.
- [ ] Crear comandos `lint:check` que no usen `--fix`; CI debe validar el contenido exacto y fallar si un formatter/linter ensucia el checkout.
- [ ] Activar build reproducible de backend, frontend, batch y mobile antes de desplegar; promover exactamente esos artefactos, con checksums y SBOM, sin recompilar desde una rama en el servidor.
- [ ] Derivar una única versión desde el tag y comprobar consistencia de packages, artefactos, health y EAS; alinear Node con `.node-version`/CI y fijar EAS e imágenes productivas, sin `latest`.
- [ ] Fijar Actions, Ansible/Python y CLIs por versión/digest con lock verificable; reemplazar `ssh-keyscan` durante el deploy por fingerprints `known_hosts` preaprobados y rotación documentada.
- [ ] Corregir el scan PostgreSQL actual actualizando imágenes/paquetes y `gosu`; una excepción/VEX debe demostrar no explotabilidad, tener owner y vencimiento, nunca silenciarse sin evidencia.
- [ ] Crear los labels que Dependabot referencia o alinear su configuración; comprobar también por qué el update semanal de Docker no genera un PR utilizable.

Resolución de PR y branches:

- [ ] Revisar #163, #164, #165 y #166 contra `main`; actualizar o recrear cada branch desde `main` y resolverlos de a uno para evitar mezclar lockfiles.
- [ ] Corregir los checks compartidos antes de integrar. Para cada PR, mergear si aporta un cambio compatible o cerrarlo con una justificación versionada y, si aplica, una tarea de reemplazo.
- [ ] Reconsultar PRs y refs luego de cada merge/cierre; incorporar mediante PR cualquier commit aceptado que todavía no sea alcanzable desde `main`.
- [ ] Verificar nuevamente que `develop` y `preview` no tengan commits útiles exclusivos; solo entonces eliminarlos del remoto junto con heads resueltos.
- [ ] Crear/actualizar la rama local `main`, hacerla trackear exclusivamente `origin/main`, confirmar igualdad de SHA, eliminar `develop`/restantes locales y ejecutar prune.
- [ ] Mantener un solo branch permanente. Todo branch futuro debe nacer de `main`, corresponder a un PR activo y borrarse automáticamente al mergear o cerrar.

Protección y release:

- [ ] Endurecer el ruleset de `main`: sin force-push ni borrado, conversaciones resueltas, checks requeridos estables, PR obligatorio y aprobación humana definida según el tamaño del equipo.
- [ ] Crear ruleset de tags `v*` que impida mover, sobrescribir o borrar tags publicados; usar tags anotados y, cuando la gestión de claves esté resuelta, firmados.
- [ ] Habilitar `deleteBranchOnMerge`; crear un environment `production-release` restringido a tags y sin bypass, separado de `production-ops` para los jobs batch manuales. EAS debe usar el environment de release.
- [ ] Revisar con permisos administrativos webhooks, GitHub Apps y servicios externos que puedan autodesplegar; la ausencia de otro trigger debe verificarse fuera de los YAML del repositorio.
- [ ] Validar que el tag sea nuevo, exacto, apunte a un commit de `origin/main`, sea el mismo SHA probado y no exista otro run/deploy activo (`concurrency`).
- [ ] Antes del primer tag —y como preflight de cada release— exigir cero PR abiertos y ningún head remoto distinto de `main`.
- [ ] Ejecutar migraciones con inventario de checksums/colisiones, dry-run, backup y restore probado; validar tanto instalación limpia como upgrade desde la versión productiva anterior.
- [ ] Desplegar a un directorio de release versionado y conmutar un symlink de forma atómica solo después de preflight y migraciones expand/contract; ejecutar health y smoke tests, y hacer rollback automático a la versión anterior si falla. Un rollback de código no intenta revertir destructivamente una migración incompatible.
- [ ] Endurecer operaciones batch manuales: compilar una vez, eliminar el fallback `dist || ts-node`, tipar/allowlist de argumentos, restringir ref y actor, agregar `concurrency` e idempotencia, y versionar el scheduling productivo que hoy vive solo en crontab.
- [ ] Publicar GitHub Release solo después del deploy: changelog, tag, SHA, artefactos/checksums, SBOM, evidencias de gates, migraciones, aprobador, smoke tests y enlace al run. Definir retención del bundle.
- [ ] Reescribir y ensayar `docs/deployment/deployment.md`: Node vigente, TLS de origen para Cloudflare Full (strict), rutas únicas, manejo de secretos sin imprimirlos y rollback por tag.

Criterios de salida:

- `git branch --format='%(refname:short)'` devuelve únicamente `main` y `git rev-parse main` coincide con `origin/main`.
- `git ls-remote --heads origin` devuelve únicamente `refs/heads/main` en el estado estable; `gh pr list --state open` devuelve cero antes del primer release.
- Todos los commits aceptados están contenidos en `main`; cada PR/branch descartado tiene motivo registrado.
- Un push/merge a `main`, un tag inválido y un despacho manual no despliegan. Un tag válido sobre el SHA verde sí despliega exactamente una vez.
- El ambiente informa el tag y SHA esperados; smoke, observabilidad y rollback ensayado dejan evidencia recuperable.

### Etapa 0 — release gate de seguridad y control

**Objetivo:** impedir fuga multiempresa, escalada de permisos, pérdida/duplicación de mensajes y ejecución duplicada.

**Ventana orientativa:** 1–2 sprints.

**Regla:** mientras este gate no esté verde, todo inbound de WhatsApp permanece deshabilitado en producción. Luego puede habilitarse lectura segura; las propuestas siguen siendo no ejecutables fuera de entornos aislados hasta que también estén verdes la Etapa 2 y el gate individual del command.

Trabajo:

- [ ] Incorporar `companyId` y scope de objeto a usuarios, inquilinos, contratos, pagos, cuentas, movimientos y demás servicios.
- [ ] Corregir los GET que generan datos; separar command de creación.
- [ ] Eliminar `permissions` del perfil propio.
- [ ] Cambiar guards backend y frontend a deny-by-default.
- [ ] Completar recursos/acciones de staff; separar permiso de operar y aprobar.
- [ ] Exigir `JWT_SECRET` al arranque y rechazar usuarios inactivos.
- [ ] Definir revocación/rotación de sesión.
- [ ] Transaccionar confirmación de pagos y movimientos financieros.
- [ ] Agregar constraints e idempotencia para recibos, movimientos y operaciones.
- [ ] Crear `pending_actions` v2 con expiry, version, preconditions e idempotency key.
- [ ] Hacer claim atómico y verificar resultado antes de ejecutar.
- [ ] Recalcular rol, permiso, compañía, objeto y policy al aprobar.
- [ ] Redactar o cifrar payloads sensibles.
- [ ] Excluir auth, webhooks, tests y endpoints internos del catálogo IA.
- [ ] Excluir `TestModule` y `/test/*` del build productivo; inventariar y cerrar cualquier superficie de diagnóstico equivalente.
- [ ] Deshabilitar firma digital productiva mientras use `MockAdapter`/`sign.example.com`; su webhook público debe verificar firma y replay, resolver compañía, aceptar solo transiciones permitidas y actualizar solicitud/contrato en una transacción idempotente.
- [ ] Crear DTOs/serialización de respuesta con allowlist y marcar secretos `select: false`; impedir que password hash/reset tokens, permisos internos y datos bancarios viajen al cliente por relaciones TypeORM.
- [ ] Corregir scopes de owner/staff y bancos: un rol externo no lista todos los propietarios ni cuentas de la compañía y una respuesta autorizada contiene solo campos necesarios.
- [ ] Endurecer uploads: límites de tamaño/dimensión, magic bytes, protección contra decompression bombs/malware, cuotas, retención y almacenamiento seguro; imágenes temporales/privadas requieren policy o URL firmada, no un UUID público.
- [ ] Rehidratar sesión web de forma segura tras reload/multitab/expiración y conservar compañía/permisos sin hacer default-allow; decidir cookie HttpOnly/BFF frente al token actual y probar la alternativa elegida.
- [ ] Implementar rate limit distribuido para auth/OTP/webhooks, resolver IP solo desde proxies confiables, hacer fail-closed cualquier bypass local en producción y eliminar `localhost` del CORS productivo.
- [ ] Proteger `/metrics` en red/borde y autenticar/rate-limit/allowlist de `/frontend-metrics`; ninguna etiqueta controlada por cliente puede crear cardinalidad o costos sin límite.
- [ ] Persistir cada webhook en un inbox durable antes de responder 200 y deduplicar por WAMID.
- [ ] Procesar inbox con leases, reintentos acotados, backoff, dead-letter y recuperación después de reinicio.
- [ ] Enviar respuestas, documentos y efectos externos mediante outbox transaccional e idempotencia del proveedor.
- [ ] Aplicar antes de habilitar inbound una política mínima de consentimiento, retención/borrado, redacción de teléfono/texto/audio/transcripción, rate limiting y presupuesto por compañía.
- [ ] Extender transacciones/idempotencia a recibos de venta, conciliación, numeraciones y cualquier efecto financiero multi-escritura.
- [ ] En conciliación, propagar un único `QueryRunner.manager`/unidad de trabajo hasta `PaymentsService`; el advisory lock y rollback no sirven si los repositorios escriben fuera de esa transacción.

Pruebas de gate:

- Empresa A no puede leer ni mutar UUID de empresa B en cada dominio.
- Owner/tenant/buyer solo ven objetos relacionados.
- Staff sin permisos no accede a ningún módulo adicional.
- Staff no puede editar sus propios permisos.
- Veinte aprobaciones concurrentes producen una ejecución.
- Replay devuelve el mismo resultado sin duplicar efectos.
- Una propuesta vencida, obsoleta o ya reclamada no ejecuta.
- Una falla intermedia no desalineará pago, saldo, factura, movimiento y recibo.
- Inyectar una falla antes/después de cada escritura de conciliación demuestra rollback completo; solo el outbox confirmado puede ejecutar I/O externo.
- Reentregar el mismo WAMID no duplica mensaje, propuesta, respuesta ni efecto; responder 200 implica que el inbox ya sobrevivirá una caída.
- Logs, traces, métricas, dead-letter y evidencias no exponen PII ni payloads crudos.
- Ninguna respuesta serializa hashes/tokens de credenciales o bancos ajenos; tests negativos cubren relaciones cargadas, errores y cada rol.
- Uploads inválidos, sobredimensionados, privados o temporales se rechazan sin quedar públicamente accesibles.
- Reiniciar/recargar clientes no eleva permisos ni rompe una sesión válida; rate limits funcionan con más de una instancia y no confían en headers arbitrarios.
- Un webhook de firma falso, repetido, concurrente, de otra compañía o con transición inválida no cambia solicitud ni contrato.

### Etapa 1 — baseline de producto, roles y lenguaje

**Objetivo:** establecer una fuente única de verdad y aprender cómo operan usuarios no técnicos.

**Ventana orientativa:** 2–3 semanas, en paralelo con Etapa 0 donde no haya dependencia.

Trabajo:

- [ ] Inventariar cada capacidad existente de backend, web, mobile y WhatsApp.
- [ ] Crear el manifiesto canónico y un validador en CI; cada historia fuente debe apuntar a una capacidad, estado, owner y evidencia o a una decisión de rechazo.
- [ ] Reconciliar `SISTEMA DE ALQUILERES.docx` → `raw.md` → historias → manifiesto. Recuperar o decidir explícitamente el requisito sensible “ingresos en blanco” y no almacenarlo sin base legal, minimización y retención.
- [ ] Corregir IDs duplicados —hoy `US-PAY-01..04` describen historias distintas— y prohibir duplicados/referencias huérfanas en CI.
- [ ] Cerrar matriz rol × permiso × relación × acción × canal.
- [ ] Resolver buyer, interested/contact y staff especializado.
- [ ] Decidir persona de negocio multirol frente a identidades separadas y login; cubrir owner operativo sin email/cuenta, unificación de duplicados y transición interested → tenant/buyer sin pérdida de historial.
- [ ] Unificar consentimiento, vinculación OTP, revocación y número por compañía.
- [ ] Validar glosario con usuarios: cobro, pago, liquidación, factura, recibo, comprobante y cuota.
- [ ] Resolver el contrato canónico: estados de borrador/firma/activo/finalizado, reglas distintas rental/sale, ausencia de `unitId`, carga de contratos vigentes, import DOCX y compatibilidad/migración de datos existentes.
- [ ] Publicar OpenAPI versionado y generar de forma reproducible los clientes web/mobile; agregar CI anti-drift y retirar DTO/mappers manuales una vez migrado cada consumidor.
- [ ] Crear fixtures reproducibles con al menos dos compañías, los cinco roles, staff sin/con permisos y objetos propios/ajenos; los datos demo actuales de una sola compañía no prueban aislamiento.
- [ ] Observar al menos cinco sesiones de tareas reales con personas no técnicas.
- [ ] Medir tiempo, errores, dudas y vocabulario de los seis recorridos prioritarios.
- [ ] Decidir y validar una sola arquitectura de información: Inicio por tareas/cinco grupos, dos paneles Propiedades/Pagos o dashboard Ventas/Alquileres. Marcar las alternativas reemplazadas; no mantener tres diseños “vigentes”.
- [ ] Prototipar y validar la navegación elegida e Inicio por rol.
- [ ] Crear ADR “arquitectura as-is” y clasificar el 100% de los documentos como canónicos, operativos, requisitos fuente, evidencia, históricos o rechazados.
- [ ] Actualizar privacidad para inbound, audio, transcripción, OpenAI, retención y auditoría.

Criterios de salida:

- El 100% de capacidades tiene clasificación provisional.
- El 100% de historias fuente tiene ID único y trazabilidad a capacidad/decisión; no hay IDs ni referencias huérfanas.
- No hay una ruta sin política explícita.
- OpenAPI y clientes generados son reproducibles y CI falla ante drift.
- Los fixtures A/B demuestran aislamiento por compañía, rol, permiso y relación.
- Cinco usuarios objetivo entienden la navegación sin explicación previa.
- Glosario, roles, identidad/persona, estados contractuales, arquitectura de información y consentimiento tienen decisión versionada y migración cuando corresponda.

### Etapa 2 — bandeja “Revisar” web y mobile

**Objetivo:** convertir la confirmación técnica actual en una decisión informada y segura.

**Ventana orientativa:** 2–3 sprints.

Backend:

- [ ] API dedicada de propuestas con payload seguro, diff, riesgo, policy, vencimiento y fuente.
- [ ] Estados `NEEDS_INFO`, `PENDING_APPROVAL`, `APPROVING`, `EXECUTED`, `REJECTED`, `EXPIRED`, `CONFLICT`, `FAILED`.
- [ ] Editar significa crear una nueva versión/propuesta; nunca mutar silenciosamente la original.
- [ ] Autorización por permiso y relación, no solo admin/staff.
- [ ] Auditoría append-only y outbox de notificaciones.

Web:

- [ ] Entrada persistente “Revisar” con contador.
- [ ] Lista por prioridad, vencimiento y riesgo.
- [ ] Detalle con solicitante, rol, WhatsApp de origen, fecha y entidad.
- [ ] Resumen en lenguaje de negocio y diff campo por campo.
- [ ] Impacto financiero/contractual y advertencias.
- [ ] Aprobar, proponer corrección o rechazar con motivo.
- [ ] Reautenticación/step-up según policy.
- [ ] Resultado visible, historial y recuperación.

Mobile:

- [ ] Tab o CTA persistente con badge.
- [ ] Push notification y deep link autenticado.
- [ ] Mismo detalle, diff y policy que web, adaptado a cards.
- [ ] Estados offline, reintento y propuesta ya procesada.
- [ ] Accesibilidad de lector de pantalla y targets táctiles.

Criterios de salida:

- Una persona no técnica puede explicar qué cambiará antes de aprobar.
- Web y mobile completan el mismo E2E.
- No se usa `window.confirm` o `window.prompt` para decisiones de negocio.
- Toda ejecución queda vinculada al mensaje y propuesta de origen.
- WhatsApp informa resultado, pero no acepta confirmación.

### Etapa 3 — Inicio y navegación centrados en tareas

**Objetivo:** hacer simple el uso cotidiano antes de sumar más módulos.

**Ventana orientativa:** 2 sprints.

Trabajo:

- [ ] Aplicar los cinco grupos de navegación y permisos derivados del manifiesto.
- [ ] Crear Inicio por rol con “Para hacer hoy”.
- [ ] Integrar comunicaciones, propuestas, vencimientos y alertas en una bandeja accionable.
- [ ] Agregar búsqueda global y recientes/favoritos.
- [ ] Corregir enlaces visibles que terminan en “Acceso denegado”.
- [ ] Implementar destino correcto de login para buyer.
- [ ] Alinear portales owner/tenant y crear experiencia buyer.
- [ ] Hacer que mobile dirija cada rol a su inicio correspondiente.
- [ ] Eliminar estados crudos, UUID y etiquetas técnicas.
- [ ] Convertir tablas mobile en cards y corregir drawer/foco/responsive web.
- [ ] Revalidar y remediar `FT-WCAG-001..010`: labels/nombres accesibles, filtros, landmarks y `h1`, jerarquía, estado de menús, acciones por teclado, errores asociados y contraste. No archivar la auditoría WCAG hasta transferir y cerrar cada hallazgo con evidencia.

Criterios de salida:

- Máximo cinco grupos primarios por rol.
- Cero enlaces visibles a rutas no autorizadas.
- Cero rutas sensibles accesibles por deep link sin policy backend.
- Al menos 90% de éxito en tareas de orientación y búsqueda.
- Los diez hallazgos WCAG tienen estado y evidencia actualizados; axe, teclado, foco, zoom y lector de pantalla se prueban con contenido real y no solo estados vacíos/Unauthorized.

### Etapa 4 — recorridos verticales prioritarios

**Objetivo:** validar la paridad por capacidad en orden de valor, no por módulo.

**Ventana orientativa:** 4–8 sprints, entregando un recorrido por vez.

#### Recorrido A — buscar persona y entender situación

- Buscar por apellido, teléfono o documento.
- Ver una persona sin duplicar identidad aunque tenga varios roles; mostrar relación, contratos, deuda, tareas y comunicaciones permitidas.
- Registrar y consultar actividades de owner/tenant/buyer/interested en una línea de tiempo autorizada, incluida la reserva persona–propiedad visible desde ambos lados.
- Web y mobile con el mismo resumen.
- WhatsApp responde con datos scoped y evidencia.

#### Recorrido B — registrar cobro y compartir comprobante

- Seleccionar persona/contrato sin UUID.
- Mostrar monto esperado, período, vencimiento, deuda y moneda, calculados desde contrato/facturación.
- Permitir en el borrador previo a emisión agregar o corregir alquiler, impuestos, servicios y otros ítems variables; mostrar total y consecuencias.
- Aplicar o eximir mora por cobro solo con permiso, motivo y auditoría, sin alterar silenciosamente la regla contractual.
- Registrar de forma transaccional e idempotente; numeración, cuenta corriente, factura, nota de crédito, documento y notificación no pueden quedar desalineados.
- Generar, persistir, descargar, reimprimir y compartir un recibo inmutable sin sobrescribir períodos anteriores.
- WhatsApp consulta estado o propone; frontend confirma.

#### Recorrido C — contrato, vencimiento y renovación

- Resumen legible y línea de tiempo.
- Alertas y siguiente acción.
- Formulario por pasos y sección avanzada según rental/sale; estados, firma, anexos, finalización y solapamientos siguen el contrato canónico.
- Carga de contratos vigentes, importación DOCX y renovación con preview/versionado y revisión explícita.
- Calcular ajustes opcionales IPC, ICL y Casa Propia con fuente, períodos, fórmula, redondeo y fallback visibles; permitir override autorizado y auditado.
- Calcular comisión variable configurada —incluidos 3% y 5%— sin porcentajes hardcodeados y mostrar su efecto en cobro/liquidación.
- Al activar, generar y persistir el PDF contractual exacto; cambios posteriores crean versión/anexo, no reescriben el documento firmado.
- WhatsApp explica y crea propuesta con diff.

#### Recorrido D — propiedad, interesado y visita

- Búsqueda de propiedad/dirección.
- Filtrar propiedades de venta por rango de inversión y cruzarlas con perfiles de compra/alquiler por presupuesto, grupo, mascotas, garantías y tipo de inmueble.
- Captura de interesado, visita, resultado/oferta y siguiente tarea; detectar duplicados y conservar sugerencias, reservas, visitas y respuestas en la línea de tiempo.
- Mobile optimizado para campo.
- Al registrar/completar una visita, notificar automáticamente al owner según consentimiento con propiedad, fecha, resultado y, si existe, moneda/valor de oferta; persistir entrega, reintento y error.
- Conversión de interesado con identidad bien definida.
- Clasificar y validar el alcance CRM fuente: importación/captura multicanal, campos configurables, calificación, embudo e historial/motivo de pérdida, recordatorios, matching trazable, cierre automático, plantillas/log de envíos, métricas por embudo/agente, auditoría y consentimiento.

#### Recorrido E — mantenimiento

- Owner/tenant solicita con texto, voz y fotos.
- Staff prioriza, asigna, comenta y cierra.
- Solicitante ve estado propio.
- WhatsApp inicia solicitud; web/mobile confirma datos y cambios de estado según policy.

#### Recorrido F — venta, cuota y comprobante

- Buyer ve acuerdo, cuotas y documentos propios.
- Staff registra cuota de forma transaccional e idempotente; dos solicitudes concurrentes no repiten numeración, pago ni PDF.
- El comprobante muestra cuota, atraso, saldo restante y saldo a favor; no permite sobrepago ambiguo ni valores negativos silenciosos.
- Web/mobile generan, persisten, reimprimen y comparten un PDF con original y duplicado realmente verificables.
- WhatsApp consulta y propone sin exponer otros compradores.

Documentos transversales:

- Facturas batch, recibos, notas de crédito y contratos activos persisten su PDF, metadata, checksum y versión; se consultan desde el módulo y relación autorizados.
- Generar o enviar un documento es idempotente y usa outbox; un fallo de S3/proveedor no deja la operación de negocio falsamente completa ni se oculta con un `console.error`.
- Los PDFs se prueban con render real —contenido, cantidad de páginas/copias, caracteres, importes y accesibilidad— además de mocks del generador.

Cada recorrido se libera solo al cumplir la Definition of Done transversal y cerrar la trazabilidad de sus historias fuente.

### Etapa 5 — WhatsApp de lectura con cobertura por rol

**Objetivo:** ofrecer información útil, exacta y segura antes de ampliar comandos.

**Ventana orientativa:** incremental junto a cada recorrido.

Trabajo:

- [ ] Reusar y observar el inbox/worker/outbox cerrados en Etapa 0; ningún dominio implementa un segundo camino en memoria o fire-and-forget.
- [ ] Vinculación OTP y reverificación de teléfono.
- [ ] Step-up mediante deep link para información sensible.
- [ ] Enrutador por dominio/rol/intención.
- [ ] Queries de negocio versionadas con policy central.
- [ ] Evidencia estructurada en respuestas: fuente, entidad, fecha y alcance.
- [ ] Abstención y aclaración ante identidad, empresa o intención ambigua.
- [ ] Minimización y redacción antes de invocar el modelo.
- [ ] Evals por rol, dominio, idioma, audio y adversarial prompt injection.
- [ ] Pruebas anti-fuga empresa A/B y objetos no relacionados.
- [ ] Métricas de respuesta, abstención, costo y satisfacción sin PII en logs.
- [ ] Aplicar borrado/exportación, revocación de consentimiento y límites de consumo también al corpus, chunks, audio, transcripciones, evals y dead-letter.
- [ ] Conservar evals y reportes operativos como evidencia inmutable del tag/SHA, con ambiente, muestra, fecha, owner y retención; archivos efímeros en `/tmp` no prueban un gate.

Criterios de salida por dominio:

- Cobertura de preguntas definida y medida.
- Cero fugas en evals de rol/compañía.
- Respuesta con evidencia o abstención; nunca invención silenciosa.
- Reiniciar el proceso en cualquier etapa no pierde ni duplica el mensaje.
- Cuando RAG esté habilitado: cero chunks faltantes/stale/huérfanos o de dimensión inválida, recall ≥ 0,95, errores < 1%, p95 de respuesta < 8 s y p95 de frescura < 60 s bajo la carga acordada.
- Alertas RAG/inbox/outbox se dispararon y recuperaron en staging; restore y rollback a `TOOLS` fueron ensayados. La promoción es por compañía y `AI_RAG_ENABLED_COMPANY_IDS=*` permanece prohibido sin evidencia para todas.

### Etapa 6 — propuestas WhatsApp para todas las capacidades aplicables

**Objetivo:** completar la paridad conversacional de cambios usando el circuito seguro de Etapa 2.

**Ventana orientativa:** incremental, después de que cada command pase el gate.

Orden:

1. Cambios propios de bajo riesgo.
2. Solicitudes operativas reversibles.
3. Mantenimiento y comunicaciones.
4. CRM, visitas y contratos no financieros.
5. Cobros, cuotas, liquidaciones y contratos con `dual_control`.
6. Usuarios, permisos, bancos y eliminaciones solo con controles reforzados.

Cada command requiere:

- Schema versionado y summary/diff específico.
- Policy y riesgo declarados.
- Handler idempotente compartido con REST.
- Precondiciones/versiones de entidad.
- E2E WhatsApp → propuesta → web/mobile → ejecución → notificación.
- Caso de rechazo, vencimiento, conflicto, replay y doble aprobación.

No se libera un command mediante una herramienta genérica de endpoint.

### Etapa 7 — paridad restante e integraciones

**Objetivo:** completar capacidades con valor comprobado sin volver a una expansión horizontal indiscriminada.

Orden provisional:

- Comunicaciones y preferencias unificadas.
- Reportes mobile útiles, no pantallas placeholder.
- Endurecer la conciliación bancaria neutral existente y validar revisión manual, alertas, replay, concurrencia y contabilidad de extremo a extremo.
- Endurecer el adapter MercadoPago existente: unicidad por ID externo, validación de monto/moneda/factura, replay/concurrencia y conexión al mismo command transaccional de pago, cuenta corriente, recibo y notificación. Sandbox verde no equivale a producción.
- Proveedor bancario productivo: movimientos, webhooks y cuentas virtuales por propiedad. El job de liquidaciones permanece fail-closed mientras la “transferencia” sea una referencia `TRF-*` simulada.
- Reemplazar/endurecer la firma digital mock existente con un proveedor real: identidad, firma de webhook, estados/transiciones, company scope, inbox/replay, idempotencia, transacción y reconciliación validados antes de habilitarla.
- ARCA/facturación según necesidad regulatoria validada.
- Push notifications para mobile con registro, revocación y preferencias por usuario.
- Envío durable de recibos y notificaciones, con reintentos e idempotencia del proveedor.
- Reemplazar el adapter siempre-mock de portales por un proveedor real y validado; bloquear publicación productiva hasta entonces, conservando el dominio/API scoped ya implementado.
- Configuración y operaciones masivas web-only, accesibles desde WhatsApp mediante deep link.

Cripto, Qdrant o reescritura en Rust no entran al roadmap sin caso de negocio, prototipo, costo total y ADR aprobada.

### Etapa 8 — confiabilidad, cumplimiento y rollout

**Objetivo:** operar en producción con evidencia y límites claros.

Trabajo:

- [ ] Política de privacidad y retención implementada, no solo documentada.
- [ ] Exportación/borrado de datos que incluya IA y WhatsApp.
- [ ] Gestión y rotación de secretos sin defaults inseguros.
- [ ] Backup/restore probado y plan de recuperación con responsables y objetivos RPO/RTO.
- [ ] Observabilidad de inbox, outbox, propuestas, commands y proveedores.
- [ ] Alertas sin PII, con runbook y ensayo de estado firing/recovery.
- [ ] Rate limiting, protección contra abuso y presupuestos de consumo por compañía/canal.
- [ ] Headers de seguridad y controles de borde verificados en el entorno productivo; endurecer la CSP existente y retirar `unsafe-inline` mediante nonces/hashes cuando sea viable.
- [ ] Definir y aprobar SLI/SLO, error budgets, disponibilidad, latencia, RPO/RTO, escalamiento y on-call; los números aspiracionales de documentos históricos no son compromisos vigentes por omisión.
- [ ] Presupuestos de rendimiento y capacidad; optimizar queries, índices, paginación y caché solo a partir de mediciones.
- [ ] Pruebas de carga, seguridad, concurrencia y recuperación.
- [ ] WCAG 2.2 AA web y mobile con tecnologías asistivas.
- [ ] E2E real por rol, navegador, viewport, Android/iOS y conectividad.
- [ ] UAT con personas no técnicas.
- [ ] Documentación OpenAPI, runbooks, manual de usuario y capacitación alineados con el producto vigente.
- [ ] Setup reproducible desde un clon limpio: dependencias, env de ejemplo, infraestructura, migraciones, seed/demo, builds, tests y smoke de backend/frontend/batch; mobile se valida con su matriz nativa.
- [ ] Estrategia y ensayo de migración de datos para cada compañía que ingrese al rollout.
- [ ] Feature flags por compañía/capacidad.
- [ ] Despliegue gradual, kill switch y rollback.

## 10. Backlog inmediato ordenado

### Ahora — bloqueantes

1. Congelar releases; resolver #163–#166, unificar branches en `main` y reemplazar todo deploy por branch con tag exacto `vMAJOR.MINOR.PATCH`.
2. Corregir las vulnerabilidades de la imagen PostgreSQL y convertir todos los controles de CI/CD en gates reales sobre el SHA desplegado.
3. Aislamiento multiempresa, scope de objeto, datos bancarios y RBAC deny-by-default en backend/frontend/mobile/IA.
4. Serialización segura, cierre de `/test/*`, protección de métricas, uploads privados y límites de abuso/auth.
5. Integridad transaccional e idempotencia de pagos, cuentas, conciliación, recibos, ventas y efectos externos.
6. Pending actions exactamente una vez, reautorizadas, versionadas y expirables.
7. Inbox/outbox WhatsApp durable, deduplicación, privacidad/retención mínima y presupuestos antes de habilitar inbound.
8. JWT fail-closed, usuarios inactivos, revocación y rehidratación de sesión sin perder compañía/permisos.
9. Deshabilitar firma digital mock y cualquier adapter productivo simulado hasta implementar sus controles de webhook.
10. Matriz de capacidades/roles/canales e historias fuente trazables con IDs únicos.
11. OpenAPI canónico y clientes web/mobile generados con gate anti-drift.
12. Mantener inbound y ejecución mutable por WhatsApp deshabilitados hasta los gates indicados en Etapas 0 y 2.

### Siguiente — producto utilizable

1. Bandeja Revisar web/mobile.
2. Inicio y navegación por tareas/rol.
3. Buyer y portales coherentes.
4. Buscar persona y registrar cobro.
5. Contrato/vencimiento y mantenimiento.
6. Accesibilidad mobile base y responsive web.
7. E2E real por rol/dispositivo con mocks completos o entorno aislado.

### Después — escala multicanal

1. Vinculación OTP y cobertura de lectura IA por dominio sobre el inbox/outbox ya validado.
2. Commands progresivos con proposal/confirmation policy.
3. Ventas/cuotas y capacidades CRM trazadas, no un bloque ambiguo “CRM completo”.
4. Integraciones reales priorizadas y rollout gradual.

## 11. Pruebas obligatorias

### Contrato y autorización

- Matriz generada contra rutas, navegación y tools.
- Empresa A/B para cada query/command.
- E2E REST A/B por cada controller y caso de uso sensible; no inferir aislamiento por pruebas unitarias de servicios vecinos.
- IDs válidos pero no relacionados.
- Staff con cada combinación de permisos, incluida lista vacía.
- Reemplazar el test actual que consagra `RolesGuard` default-allow por casos deny-by-default para ruta sin metadata, recurso no mapeado y lista vacía.
- Owner, tenant y buyer con objetos propios y ajenos.
- Respuestas con relaciones cargadas nunca incluyen password hash/reset token, permisos no autorizados, PII innecesaria ni bancos ajenos.

### Superficies públicas, archivos y webhooks

- `/test/*` no existe en el artefacto productivo; métricas solo aceptan scrapers/orígenes y etiquetas acotados.
- Upload por tipo real, tamaño, dimensión, decompression bomb, malware, cuota, autorización, expiración y acceso a temporales.
- Auth distribuida ante fuerza bruta, spoof de `X-Forwarded-For`, bypass local, CORS no permitido, revocación y reload/multitab.
- Webhooks WhatsApp, MercadoPago, firma y proveedores ante firma falsa, timestamp, replay, reorder, concurrencia, entidad/compañía ajena y transición inválida.

### Propuestas y concurrencia

- Doble click, reintento de red y veinte aprobadores concurrentes.
- Proposal vencida, rechazada, obsoleta o ya ejecutada.
- Cambio de permisos entre propuesta y aprobación.
- Cambio de entidad entre preview y aprobación.
- Falla antes/después de cada escritura o efecto externo.

### Canales

- Web desktop y mobile responsive.
- Mobile Android e iOS.
- Texto y audio WhatsApp.
- Links vencidos, usados por otra cuenta o de otra compañía.
- Offline/reconexión y push/deep link.
- PDF/documentos renderizados realmente: contenido, checksum, persistencia, caracteres, importes y original/duplicado; no basta un PDFKit mock.

### IA

- Preguntas canónicas por rol/dominio.
- Ambigüedad de personas, compañías, monedas y vocabulario.
- Prompt injection en mensajes, documentos y notas.
- Solicitudes fuera de rol y extracción masiva.
- Respuesta con evidencia, fecha y abstención.

### Usabilidad y accesibilidad

- Pruebas moderadas con personas no técnicas desde Etapa 1.
- Navegación por teclado y lector de pantalla web.
- VoiceOver/TalkBack, tamaño de fuente y targets mobile.
- Estados con datos, vacíos, loading, error y conflicto.
- No aceptar un verde Axe sobre páginas vacías o Unauthorized.

### CI, release, migraciones y recuperación

- Lint/format en modo check y worktree limpio; ningún gate modifica el código que está validando.
- Builds instalables de los cuatro paquetes y versión derivada del tag; no depender de `latest` ni de herramientas flotantes.
- Cobertura sobre páginas, API/UI mobile y lógica financiera; retirar exclusiones que oculten negocio crítico y fijar umbrales por riesgo.
- Playwright con datos reales y navegadores/viewport acordados; Detox Android/iOS bloqueante para recorridos críticos.
- Instalación limpia y upgrade desde la versión productiva anterior, con checksums de migración, backup, restore y rollback expand/contract.
- Tag inválido/fuera de `main`, push a `main`, despacho manual, dos releases concurrentes y fallo de smoke no pueden producir un deploy incorrecto.

## 12. Definition of Done transversal

Una capacidad está `Validada` solo si:

- Tiene actor, objetivo, términos, estados e historia fuente/decisión trazable con ID único.
- Tiene query/command de dominio y API versionada.
- El cliente generado coincide con OpenAPI y CI no detecta drift.
- Aísla compañía y objeto; política deny-by-default probada.
- Está disponible en web y mobile según clasificación.
- Tiene lectura y/o propuesta WhatsApp según clasificación.
- Toda propuesta WhatsApp confirma en web/mobile.
- Tiene policy de riesgo y aprobador explícito.
- Es transaccional, idempotente y auditable cuando muta.
- Tiene errores comprensibles, loading, vacío y recuperación.
- Cumple accesibilidad e i18n.
- Tiene contract, integration y E2E por rol/canal.
- Tiene observabilidad y runbook.
- Actualiza manifiesto y documentación canónica.
- No depende de mocks/adapters simulados en producción ni expone secretos/PII fuera de la allowlist de respuesta.

## 13. Métricas y gates de producto

Objetivos iniciales:

- Al menos 90% de éxito en tareas críticas con usuarios no técnicos.
- Persona/contrato localizado en menos de 15 segundos.
- Cobro habitual registrado en menos de 60 segundos.
- Propuesta de bajo riesgo comprendida y revisada en menos de 60 segundos.
- Cero accesos cruzados en la matriz automatizada.
- Cero duplicaciones ante replay o concurrencia.
- 100% de mutaciones WhatsApp representadas como propuestas auditables.
- 100% de capacidades P0 con clasificación y evidencia web/mobile.
- 100% de respuestas sensibles con evidencia o abstención.
- Reducción progresiva de soporte requerido y abandono por recorrido.

Gate de release por capacidad:

1. Seguridad verde.
2. Contrato y policy verdes.
3. Web/mobile verdes.
4. WhatsApp/evals verdes.
5. Usabilidad/accesibilidad verdes.
6. Observabilidad y rollback verdes.

Gate de release productivo:

1. Etapa -1 cerrada; cero PR/head temporal y `main == origin/main`.
2. Tag exacto, nuevo e inmutable sobre el mismo SHA verde.
3. Artefactos/checksums/SBOM y migraciones asociados a ese SHA.
4. Aprobación de `production-release`, deploy único y smoke verde.
5. GitHub Release y bundle de evidencia publicados; versión previa recuperable.

## 14. Gobierno documental

### Fuente de verdad objetivo

- `docs/plan-de-trabajo.md`: único plan vigente, prioridades y gates.
- `docs/auditoria-integral-2026-08-27.md`: baseline fechado; debe agregar owner, estado, commit de corte y documento reemplazado antes de considerarse canónico completo.
- Manifiesto de capacidades: a crear en Etapa 1.
- ADR de arquitectura as-is: a crear en Etapa 1.
- `rag_plan.md`: workstream técnico subordinado mientras siga alineado.

### Requisitos fuente, no descripción del estado actual

- `docs/user/SISTEMA DE ALQUILERES.docx` y `docs/user/raw.md`: voz original del negocio; deben conservarse y reconciliarse sin perder requisitos.
- `docs/user/historias-de-usuario*.md`: requisitos derivados; requieren IDs únicos, estado y links al manifiesto.
- `docs/functional/drf-original.md`: necesidad/diseño original; sus opciones técnicas, integraciones y navegación no son decisiones vigentes.
- `docs/user/casos-de-uso-datos-demo.md`: fixture de demostración, no evidencia multiempresa hasta incorporar compañía A/B y matriz de roles.

### Documentos operativos a revalidar

- `docs/deployment/deployment.md`: reescribir para un solo `main`, release por tag/SHA y operación real; eliminar flujo develop/preview, Node 20, rutas `/opt`/`/var` contradictorias y comandos que imprimen secretos.
- `docs/development/local-setup.md`: completar setup ejecutable desde clon limpio y retirar “próximos pasos” anteriores a la implementación.
- `docs/deployment/rag-production-readiness.md`: mantener sus umbrales, pero persistir evidencia asociada a tag/ambiente en vez de dejarla en `/tmp`.
- `docs/technical/payments.md`: conservar como estado parcial fechado; quitar cripto como pendiente, resolver referencias `T213/T821` y separar adapters implementados de validación productiva.
- `docs/technical/observability-prometheus.md`: ampliar métricas/alertas/runbooks para inbox, outbox, propuestas, commands y proveedores, con prueba firing/recovery.

### Evidencia temporal

- `docs/technical/frontend-wcag22-nielsen-audit.md`: evidencia fechada con hallazgos abiertos. Solo pasa a histórico después de revalidar y transferir `FT-WCAG-001..010` con resultado por cada uno.

### Históricos hasta su reescritura

- `docs/technical/arquitectura.md`.
- `docs/technical/c4-model.md`.
- `docs/technical/der.md`.
- `docs/technical/sequence.md`.

`qdrant_plan.md` se considera propuesta no aprobada. Debe archivarse o transformarse en ADR rechazado cuando se tome la decisión formal.

### Reglas y trabajo pendiente

- [ ] Crear un índice que clasifique el 100% de `docs/` y documentos raíz relacionados; ningún archivo queda con vigencia implícita.
- [ ] Agregar a cada documento owner, estado, fecha de revisión, commit/tag de corte, audiencia y qué reemplaza; expresiones como “actual” caducan sin corte verificable.
- [ ] Agregar banner visible y enlace a ADR/plan a todo documento histórico, reemplazado o rechazado; moverlo a una ubicación inequívoca cuando no se rompan referencias.
- [ ] Validar enlaces, IDs de historias, referencias a tareas, comandos y rutas en CI.
- [ ] Registrar decisiones explícitas para navegación, modelo de persona/contrato, SLO e integraciones; no resolver contradicciones borrando la fuente original.
- [ ] Alinear README y `.github/copilot-instructions.md` con runtime, arquitectura y política Git/release vigentes. README actúa solo como portada operativa y no duplica roadmaps.
- [ ] Actualizar documentación y manifiesto en el mismo PR que cambia comportamiento; el bundle de release demuestra qué versión documental acompaña al tag.
