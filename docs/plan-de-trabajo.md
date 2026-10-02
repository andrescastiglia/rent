# Plan de mejoras de Rent

**Actualizado:** 2026-10-02

**Alcance:** backend, web, aplicación móvil, batch, datos, integraciones, calidad y diseño gráfico.

Objetivo: convertir la funcionalidad existente en una experiencia clara, atractiva y confiable para la operación inmobiliaria. Este documento reúne trabajo pendiente, con prioridades y criterios de aceptación; Git y los documentos técnicos conservan el historial.

## 1. Estado verificable y prioridades

La implementación y su evidencia se registran en la [validación del 2026-10-02](technical/validacion-plan-2026-10-02.md). Pasan tipos, lint, compilaciones necesarias, suites UT de los cuatro módulos, 511 casos HTTP/PostgreSQL y las pruebas de migraciones. La revisión web con API real tiene 102 capturas autenticadas en tres anchos y dos temas, sin errores JavaScript, desbordamiento ni incidencias axe.

Se retiraron las tareas implementadas y comprobadas. Las condiciones de publicación y la validación nativa permanecen pendientes hasta disponer de sus resultados. La revisión con Orca/Firefox comprobó 18 pantallas y las interacciones de menú y comprador; se conserva su alcance y la limitación observada con Orca/Chrome. RAG aprobó los 62 casos con proveedor real en una base local aislada. La aplicación conserva el monolito modular, persona multirrol, contrato unificado y migración aditiva.

- **P0:** resolver antes de publicar el recorrido afectado; compromete compilación, permisos o consistencia.
- **P1:** mejora necesaria de producto, diseño o calidad.
- **P2:** consolidación posterior, sin bloquear los recorridos principales.

## 2. Orden de cierre

1. Completar O02: CI Android/iOS de las correcciones nativas; la revisión accesible web está registrada.
2. Completar O06: vincular evidencia a la release; API y Web Vitals ya se midieron, se corrigió el CLS de Inicio y RAG aprobó los umbrales por compañía/rol.
3. Completar O04 e I01: CI del SHA exacto, release inmutable, migraciones, healthchecks y smoke; proveedores apagados y cron financieros suspendidos.
4. I02 queda condicionado a las cuentas y habilitación futura; su checklist ya está documentado en [proveedores externos](technical/external-providers.md).

Responsable de implementación y validación de esta entrega: Ingeniería. Operaciones registra la release y su seguimiento. O06 es requisito antes de ampliar el uso de IA.

## 3. Base de desarrollo cerrada

B01–B06 se implementaron y verificaron. Evidencia, contratos generados y pruebas: [validación de dominio](technical/validacion-plan-2026-10-02.md#dominio-y-contratos).

## 4. Diseño gráfico y experiencia — P1

### Dirección visual

Conservar la identidad del logo amarillo y grafito, y desarrollar una interfaz inmobiliaria sobria, cálida y cuidada:

- Fondos neutros, superficies claras, texto grafito y un color primario consistente. Amarillo como acento de marca; verde, ámbar y rojo para estados acompañados de texto.
- Una familia sans serif legible; cuerpo de 14–16 px, títulos de 24–30 px y cifras tabulares. Menos mayúsculas y más jerarquía mediante tamaño, peso y espacio.
- Espaciado regular de 8/16/24/32 px, radios coherentes y bordes/sombras discretos. Evitar que cada indicador sea una tarjeta de otro color.
- Fotografías de propiedades con proporción estable, portada seleccionable y alternativa visual cuidada cuando falten imágenes. Iconografía consistente con Lucide en web y su equivalente móvil.
- Una acción principal clara por contexto; acciones secundarias agrupadas y destructivas diferenciadas. Controles cómodos de 40–44 px y objetivos táctiles de al menos 44 px como criterio de diseño.
- Tema claro completo y oscuro coherente; contraste, estados de foco, carga, error y deshabilitado definidos desde el comienzo.

### Entregas

- [ ] **D07. Aplicar el diseño a móvil, portales y pantallas restantes.** Corregir el ancho del contenido y tablas de pagos; limitar el scroll horizontal al contenedor que lo requiera. Adaptar tablas a listas resumidas en pantallas pequeñas. Mobile: Inicio, tareas principales y Más; sacar funciones operativas de Ajustes y nombrar correctamente acciones como Nuevo propietario/Nueva propiedad. Extender los patrones a mantenimiento, CRM, reportes, usuarios, ajustes, acceso y portales.
  **Aceptación:** recorridos completos a 390/768/1440 px, sin desbordamiento de página, contenido tapado ni controles inaccesibles; en la app se respetan áreas seguras y teclado.

### Asistencia contextual permanente


- **Cuándo intervenir:** valores iniciales propuestos de 8 segundos desde que la pantalla está lista si no se inició ninguna acción, y 12 segundos desde la última interacción relevante durante una tarea. Los tiempos serán configurables y se ajustarán con pruebas de uso.
- **Cómo elegir el paso:** reglas explícitas por pantalla y tarea, considerando selección actual, campos pendientes, validación, estado del registro y permisos. Al avanzar, completar o cambiar de pantalla, cancelar la sugerencia anterior y reevaluar el contexto.
- **Cómo presentarlo:** tooltip guiado junto al campo o botón correspondiente, con señalamiento visual discreto; mensaje flotante breve cuando la orientación abarque la pantalla. Explicar qué hacer y para qué, con acceso a la acción cuando corresponda. La operación se ejecuta por decisión del usuario.
- **Cómo regular la frecuencia:** mostrar una sugerencia por vez; reiniciar el contador con escritura, clic, toque o desplazamiento. Pausar durante cargas, envíos, diálogos y resolución de errores. Permitir cerrar o pausar la ayuda, recordar esa preferencia y evitar repetir el mismo aviso durante la tarea; en visitas futuras reevaluar su utilidad.
- **Cómo cuidar la interacción:** respetar la prioridad de errores y confirmaciones, mantener visibles los controles y conservar el foco. Permitir lectura sin desaparición prematura, cierre por teclado y anuncio accesible sin interrumpir. Diferenciar visualmente orientación, error y confirmación de una operación.
- **Cómo redactarlo:** una o dos frases, verbo concreto y vocabulario inmobiliario: propiedad, interesado, contrato, cobro, cuota, vencimiento y liquidación. Evitar jerga técnica, mensajes genéricos y recomendaciones que no correspondan al estado real.

Ejemplos de mensajes, mostrados sólo cuando corresponda:

- **Propiedades, al entrar sin actuar:** “Busque un inmueble por dirección para consultar sus contratos y visitas”.
- **Cobros, con inquilino seleccionado y contrato pendiente:** “Seleccione el contrato al que corresponde este cobro”.
- **Contrato, con fechas pendientes:** “Complete las fechas de inicio y finalización para continuar con el contrato”.
- **Venta en cuotas, con plan iniciado:** “Indique la cantidad de cuotas y la fecha del primer vencimiento”.
- **Cobro listo para revisar:** “Revise el importe, la moneda y los conceptos antes de confirmar el cobro”.

## 5. Funcionalidad y datos


F02 quedó implementado y verificado con UT, HTTP/PostgreSQL y el CLI de facturación: conceptos variables, período/vencimiento, mora auditada, importación, adendas, emisión, cobro, recibo y anulación. Los datos históricos tienen inventario y [procedimiento de corrección](technical/scheduled-billing.md#revisión-de-datos-antes-de-reactivar-2026-10-02). La reactivación futura exige esas decisiones operativas; esta entrega conserva los cron financieros suspendidos. [Evidencia](technical/validacion-plan-2026-10-02.md#dominio-y-contratos).

## 6. Calidad, mantenimiento y operación


- [ ] **O02 · P1. Ampliar QA de recorridos y diseño.** Agregar E2E con API/PostgreSQL reales para roles, concurrencia, pagos, propuestas, uploads y PDFs; Android e iOS con evidencia por plataforma. Incorporar ventas, compradores, detalles y portales a accesibilidad, capturas de regresión visual y revisión manual de teclado/lector de pantalla. Revalidar hallazgos antiguos antes de declararlos pendientes.
  Probar D08 con tiempos controlados: entrada sin acción, tarea iniciada, reinicio por interacción, cambio de paso/pantalla, permisos, pausas y cierre de la ayuda.
  **Aceptación:** recorridos centrales sin fallas graves de accesibilidad; capturas en anchos y temas de D07; estados reales cargados, no sólo mocks o pantallas de error. La revisión completa de WCAG 2.2 AA incluye contraste y foco.


- [ ] **O04 · P1. Actualizar documentación y verificar publicación.** Alinear README, catálogo documental, mobile y batch con lo implementado. Actualizar despliegue/rollback al flujo Kubernetes vigente y distinguirlo de PM2 histórico. Verificar migraciones, configuración y compatibilidad de clientes en una entrega coordinada.
  **Aceptación:** instrucciones reproducibles, artefactos inmutables y tag/SHA coincidentes; CI, healthchecks y smoke tests verdes. No afirmar despliegues sin evidencia. Base: `.github/workflows/release.yml`, runbooks y scripts de publicación.


- [ ] **O06 · P1. Medir rendimiento y exigir los objetivos de IA.** Medir consultas/N+1, API y Web Vitals con datos representativos; aplicar los [SLO operativos](deployment/operations-slo.md). Convertir objetivos RAG en gates automáticos: recall ≥ 0,95, errores < 1 %, respuesta p95 < 8 s, frescura p95 < 60 s y cero fugas entre compañías.
  **Aceptación:** resultados RAG por tag, compañía y rol, incluido comprador; una evaluación fuera de umbral falla; mejoras de rendimiento sustentadas en mediciones. Base: `backend/scripts/run-rag-eval.js` y telemetría.

## 7. Integraciones y límites de alcance

BFA, Mercado Libre y Mercado Pago Payouts ya tienen implementación, colas y administración. Mantenerlos deshabilitados según la decisión registrada del 2026-09-28; no hay cuentas ni credenciales disponibles. BFA corresponde a sellado/verificación documental, separado de la firma de las partes.

- [ ] **I01 · P1. Verificar y desplegar las integraciones apagadas.** Comprobar que API, IA, UI y workers respetan el bloqueo; conservar consulta histórica. Documentar estados inciertos y recuperación. No simular acreditaciones ni marcar transferencias como pagadas.
  **Aceptación:** ninguna llamada externa mientras estén deshabilitadas; despliegue con flags apagados y pruebas del bloqueo. Referencia: [proveedores externos](technical/external-providers.md).

- [ ] **I02 · P2, condicionado. Preparar validación futura de proveedores.** Documentar requisitos de cuenta, credenciales, entorno de pruebas, escenarios y procedimiento de activación/reversión; validar los flujos externos cuando existan acceso y habilitación expresa.
  **Aceptación:** checklist y evidencia por proveedor antes de activar; el cron `process-settlements` continúa suspendido.

Se conserva el monolito modular, la persona multirrol, el contrato unificado asociado a propiedad y la migración aditiva. Recuperación ante desastres y ensayos de restauración quedan fuera de esta etapa, conforme al contrato de producto.

## 8. Criterio de cierre

Una tarea se cierra cuando tiene resultado verificable, pruebas proporcionales al riesgo, documentación y observabilidad necesarias. Para cambios visuales se requieren capturas y revisión de interacción; para dinero, permisos y concurrencia, pruebas de invariantes y fallos.

Trabajar en entregas pequeñas por recorrido. El plan debe conservar sólo pendientes: retirar tareas terminadas y enlazar su evidencia en Git o en el documento técnico correspondiente. El primer resultado esperado es una base compilable y cinco pantallas de referencia con un diseño común, antes de extender el rediseño al resto del producto.
