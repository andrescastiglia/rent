# Validación del plan de trabajo

Fecha: 2026-10-02. Base de trabajo: `5cd9b8f798653e5d43b8c1faf9198c3c8dcd2935`
más los cambios locales de esta entrega. Este registro distingue resultados
ejecutados de gates aún pendientes; no acredita un despliegue.

## Dominio y contratos

Backend: 166 suites UT (1887 casos) y 26 suites HTTP/PostgreSQL (511 casos) verificaron
aislamiento, roles y capacidades, adendas, importación, uploads, documentos,
checkout, cobros parciales, devoluciones, compensaciones, CRM, mantenimiento y
visitas. La autorización específica de compradores para evidencia de ventas
tiene además cinco casos PostgreSQL con compañías y compradores distintos.

Las migraciones se aplicaron en una base nueva hasta 142. Sus 16 pruebas
incluyen fallo atómico, checksums y dos ejecutores concurrentes. Los tipos
OpenAPI web/mobile se regeneraron desde el backend compilado. Los adaptadores
conservan paginación e idempotencia, y el contrato generado permite preflight
con `Idempotency-Key`.

Referencias: [anulaciones](payment-reversals.md),
[facturación](scheduled-billing.md), [ajustes](rent-adjustments.md),
[proveedores](external-providers.md), [modelo](adr-001-modelo-producto.md),
`backend/test/`, `migrations/tests/` y `shared/domain-operation-receipt.cjs`.

## Diseño, interacción y canales

La [dirección visual](design-system.md) aplica tokens semánticos, componentes
comunes, navegación por permisos y asistencia contextual. Web y portales usan
la API real y PostgreSQL con datos ficticios de una compañía aislada; los
proveedores externos permanecen apagados.

Se ejecutaron **102 capturas**: 17 pantallas, anchos 390/768/1440 y temas
claro/oscuro. Incluyen inicio, propiedades, cobros, contrato, ventas, compradores,
propietarios, detalles, mantenimiento, reportes, comunicaciones y los tres
portales. No hubo desbordamiento de página, errores JavaScript ni incidencias
axe en las reglas WCAG 2 A/AA, 2.1 AA y 2.2 AA disponibles.

La prueba exige permanecer en la ruta autenticada: una redirección al login
falla. También verifica salto al contenido, Escape/retorno del foco en el menú
móvil y acceso del comprador a la segunda página y su detalle de cuotas sin
controles de edición. Se inspeccionaron capturas de propiedad móvil oscura,
contrato de escritorio y portal comprador.

[Resultados y capturas](evidence/2026-10-02-validation/web/result.json).
La revisión automatizada y estas interacciones no equivalen a certificación
integral de WCAG ni sustituyen una revisión con lector de pantalla.

Las 128 suites web (1291 casos), 34 móviles (407 casos) y 32 batch (325 casos)
pasaron completas. Las reglas de asistencia tienen pruebas de tiempos,
interacción, pausa, errores, permisos y cambio de pantalla.

## Cobertura y análisis

La [cobertura UT por módulo](evidence/2026-10-02-validation/coverage.json)
incluye todo el código propio previsto por las configuraciones, con excepción
de tipos generados y del generador OpenAPI. Los umbrales se elevaron: líneas
backend/batch/mobile ≥90%, web ≥85%; funciones móviles ≥90% y ramas web/mobile
≥80%. No se agregaron exclusiones para ocultar incidencias.

SonarQube local analizó producción y pruebas sin excepciones por regla:
**87,9%** de cobertura global, **91,7%** de líneas, **81,3%** de ramas y
**2,7%** de duplicación en la medición de esta entrega.
Gate OK, cero incidencias abiertas y cero hotspots pendientes.
[Resultado](evidence/2026-10-02-validation/sonar-result.json).

Se corrigieron los hallazgos reales. Tres se revisaron individualmente como
falsos positivos: dos editores HTML usan `role=textbox` para conservar formato,
y el historial desplazable necesita foco de teclado. Fundamento:
[textbox WAI-ARIA](https://www.w3.org/TR/wai-aria-1.2/#textbox) y
[región desplazable W3C](https://www.w3.org/WAI/standards-guidelines/act/rules/0ssw9k/).

## Operación y gates pendientes

Las cuatro pruebas de jobs manuales verifican restricciones de Kubernetes.
Los reportes usan fuentes financieras canónicas, compañía y moneda; los fallos
parciales se reflejan en persistencia, métricas y código de salida.
`billing`, `sync-indices` y `process-settlements` deben permanecer suspendidos
en esta entrega. BFA, Mercado Libre y Payouts continúan deshabilitados.

Android/iOS se ejecutan en CI sobre el mismo commit. iOS reutiliza el binario
compilado para todos los recorridos Detox; el arranque por sí solo no cierra O02.
Faltan sus resultados de esta entrega y la revisión con lector de pantalla.

RAG se verificó con `scripts/qa/rag-local.py`: base dedicada, fixture ficticio de
dos compañías, backfill, API/worker de loopback y proveedor real. Pasaron los
**62 casos** de los cinco roles, sin errores ni fugas entre compañías o
usuarios; exactitud financiera, abstención y respuestas fundamentadas: 100%.
Recall: 98,77%; latencia p50/p95: 2778/5491 ms; frescura p95: 54,35 segundos.
Los umbrales se aprobaron completos.
[Resultado reproducible](evidence/2026-10-02-validation/rag-evaluation.json).

La medición usa `gpt-5.6-terra`, `text-embedding-3-small` y esfuerzo `none`,
configurado explícitamente para este modelo en el overlay de producción.
Otros modelos omiten el parámetro si no se configura; el esfuerzo admitido
depende del modelo, según la [documentación de OpenAI](https://developers.openai.com/api/docs/guides/reasoning).
El acceso al proveedor permanece en un archivo privado fuera del repositorio.
El script reutiliza los builds existentes y no consulta datos productivos.

Los dos comentarios CodeQL del script de QA visual se atendieron restringiendo
API/web a loopback, aceptando sólo email/password de fixtures ficticios y
bloqueando redirecciones HTTP. Cuatro pruebas verifican el rechazo antes de
enviar, el login local válido y que un 307 no alcanza un segundo servidor.
La autenticación transmite deliberadamente esas credenciales de prueba a
`/auth/login`; no se transmiten campos adicionales del archivo.

La lectura RAG de roles externos queda detrás de
`AI_RAG_EXTERNAL_READ_ENABLED=false` hasta aprobar los gates. La evaluación
local activa el flag sólo en las compañías ficticias.

La publicación requiere CI verde del SHA exacto en main, tag anotado y artefactos
inmutables, migraciones, healthchecks y smoke. Su evidencia se incorporará sólo
después de ejecutarla, conforme al [runbook Kubernetes](../deployment/kubernetes.md).
