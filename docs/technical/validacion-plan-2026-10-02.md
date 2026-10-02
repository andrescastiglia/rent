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

La lectura de agregados productivos detectó calendarios sin próxima fecha y
series históricas incompletas para ajustes. El [procedimiento de corrección](scheduled-billing.md#revisión-de-datos-antes-de-reactivar-2026-10-02)
conserva la facturación suspendida, exige decisiones por contrato y evita
reescribir facturas/snapshots. No se modificaron datos productivos.

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
integral de WCAG. Se revisaron además los anuncios de Orca 50.2 con Firefox
y AT-SPI: 18 pantallas, encabezados, nombres/estados de controles y tablas,
con teclado nativo y los mismos roles/datos aislados. El menú móvil cierra con
Escape y devuelve el foco; el comprador accede a la segunda página y al
calendario de cuotas de sólo lectura mediante teclado.
[Revisión con lector](evidence/2026-10-02-validation/screen-reader.json).
Orca/Chrome produjo una recursión interna al recorrer el encabezado del contrato;
la revisión completa se realizó en Firefox. Se corrigieron la etiqueta de salida
del portal inquilino (estaba fija en inglés) y su objetivo táctil a 44 px.
La revisión de anuncios por Ingeniería no acredita todas las combinaciones de
lectores/navegadores ni sustituye una evaluación integral de WCAG.

Las 128 suites web (1291 casos), 34 móviles (408 casos) y 32 batch (325 casos)
pasaron completas. Las reglas de asistencia tienen pruebas de tiempos,
interacción, pausa, errores, permisos y cambio de pantalla.

## Cobertura y análisis

La [cobertura UT por módulo](evidence/2026-10-02-validation/coverage.json)
incluye todo el código propio previsto por las configuraciones, con excepción
de tipos generados y del generador OpenAPI. Los umbrales se elevaron: líneas
backend/batch/mobile ≥90%, web ≥85%; funciones móviles ≥90% y ramas web/mobile
≥80%. No se agregaron exclusiones para ocultar incidencias.

SonarQube local analizó producción y pruebas sin excepciones por regla:
**88,0%** de cobertura global, **91,8%** de líneas, **81,5%** de ramas y
**2,7%** de duplicación en la medición de esta entrega.
Gate OK, cero incidencias abiertas y cero hotspots pendientes.
[Resultado](evidence/2026-10-02-validation/sonar-result.json).

Se corrigieron los hallazgos reales. Tres se revisaron individualmente como
falsos positivos: dos editores HTML usan `role=textbox` para conservar formato,
y el historial desplazable necesita foco de teclado. Fundamento:
[textbox WAI-ARIA](https://www.w3.org/TR/wai-aria-1.2/#textbox) y
[región desplazable W3C](https://www.w3.org/WAI/standards-guidelines/act/rules/0ssw9k/).

## Rendimiento medido

La API real con 1001 propiedades, 1022 contratos borrador y 21 ventas ficticias
respondió 480 solicitudes con concurrencia 4, todas HTTP 200. El peor p95 fue
146,75 ms, por debajo del objetivo de 2 segundos. Propiedades y contratos
retornaron 20/100 registros con cinco consultas SQL por solicitud en ambos
casos, incluyendo autorización: no hubo crecimiento N+1 en esos listados.
Los reportes y cobros vacíos se midieron como controles y no representan carga
financiera poblada. [Resultado API](evidence/2026-10-02-validation/performance-api.json).

Web Vitals se midieron en 18 navegaciones autenticadas con contextos nuevos,
API/PostgreSQL reales, red de 1,6 Mbps y 75 ms, y CPU móvil limitada a 4×.
La medición inicial detectó CLS 0,1203 en Inicio móvil y una muestra de
propiedades con LCP 9,076 s. Se conservó la geometría de las tres secciones de
actividades durante la carga para evitar el desplazamiento de las tarjetas.
La revalidación de Inicio móvil redujo CLS a 0,0035 en las tres muestras
(antes: 0,1203); LCP 2424/2436/2520 ms e INP 8–40 ms. Las seis navegaciones
desktop/mobile quedaron sin errores JavaScript.
[Revalidación](evidence/2026-10-02-validation/performance-web-corrected.json).
Los resultados de laboratorio se conservan y no acreditan RUM productivo.
[Resultado web](evidence/2026-10-02-validation/performance-web.json).

## Operación y gates pendientes

Las cuatro pruebas de jobs manuales verifican restricciones de Kubernetes.
Los reportes usan fuentes financieras canónicas, compañía y moneda; los fallos
parciales se reflejan en persistencia, métricas y código de salida.
`billing`, `sync-indices` y `process-settlements` deben permanecer suspendidos
en esta entrega. BFA, Mercado Libre y Payouts continúan deshabilitados.

Android/iOS se ejecutan en CI sobre el mismo commit. iOS reutiliza el binario
compilado para todos los recorridos Detox; el arranque por sí solo no cierra O02.
La ejecución `119f102` aprobó UT, web E2E, backend HTTP/PostgreSQL, batch E2E,
contenedores ARM64, migraciones y Kubernetes. Detectó un test de logging batch
desactualizado, Xcode/Swift incompatible y tres fallos Android. Las capturas
confirmaron controles fuera del área visible en Más y en el formulario de
cobro; Detox ahora desplaza el contenido antes de accionar. Se corrige la
etiqueta Propiedades y se espera la restauración de sesión antes de montar
el árbol nativo. Estas correcciones pasan UT y tipos; se exige su nuevo CI.
El CI de `282da7f` aprobó los demás gates y la compilación iOS con Xcode 26.3,
pero detectó una carrera nativa Android y acciones antes de terminar la
navegación, dos promesas web sin marca explícita y un chequeo Metro con
dirección distinta de la usada por Expo. Se aplica el backport acotado de
[react-native-screens #4498](https://github.com/software-mansion/react-native-screens/pull/4498)
a 4.25.2 mediante instalador idempotente que rechaza otra versión/fuente.
Detox espera la nueva pantalla antes de desplazar o llenar; iOS consulta
`localhost` como Expo y conserva logs/capturas sin subir DerivedData. Las
promesas ya capturan sus errores y se marcan explícitamente con `void`.
Estas correcciones requieren un nuevo CI nativo; no se consideran aprobadas
por compilar o por sus UT. La revisión con lector descrita arriba sí se ejecutó.

El [CI de `abb45b6`](https://github.com/andrescastiglia/rent/actions/runs/37032076416)
aprobó todos los gates excepto iOS. Android pasó seis suites y siete casos;
el log no volvió a registrar la excepción del encabezado. SonarCloud aprobó
el gate y quedó sin bugs ni vulnerabilidades abiertas. iOS compiló y arrancó,
pero los siete casos encontraron el mismo error de Keychain: el build tenía
`CODE_SIGNING_ALLOWED=NO` y carecía de identidad para persistir la sesión.
La nueva configuración deja que Xcode firme ad hoc el simulador y verifica
la firma antes de instalar. Detox fija español/Argentina para las confirmaciones;
el nuevo resultado iOS sigue pendiente. No se sustituye SecureStore por otro
almacenamiento ni se declara aprobado el recorrido por el arranque.

El [CI de `58f160f`](https://github.com/andrescastiglia/rent/actions/runs/37043130893)
verificó la firma, la persistencia segura de sesión y el login/navegación de iOS.
Los otros 22 jobs aprobaron, incluido Android. Seis casos iOS fallaron después
por controles tapados por el teclado o una selección antes de actualizarse el
formulario. Las capturas sustentan la corrección del desplazamiento del
teclado respecto al encabezado, gestos desde el área visible y espera de
controles. Pasan 408 UT móviles, tipos y lint; el nuevo CI nativo verificará
los recorridos completos. El build usa únicamente la arquitectura del
simulador ejecutado, evitando compilar una segunda arquitectura sin uso.

El PR #255 se cerró como duplicado: su SHA `5cd9b8f` es antecesor de `abb45b6`
y todo su trabajo de adendas permanece incluido en el PR #256.

RAG se verificó con `scripts/qa/rag-local.py`: base dedicada, fixture ficticio de
dos compañías, backfill, API/worker de loopback y proveedor real. Pasaron los
**62 casos** de los cinco roles, sin errores ni fugas entre compañías o
usuarios; exactitud financiera, abstención y respuestas fundamentadas: 100%.
Recall: 98,77%; latencia p50/p95: 2778/5491 ms; frescura p95: 54,35 segundos.
Los umbrales se aprobaron completos.
[Resultado reproducible](evidence/2026-10-02-validation/rag-evaluation.json).

La segunda evaluación para la candidata `v0.1.19` volvió a aprobar los 62 casos:
p50/p95 de 3000/5701 ms, recall 98,77%, frescura p95 de 54,35 segundos y cero
fugas. El tag todavía no se publicó. El [reporte](evidence/2026-10-02-validation/rag-release-candidate.json)
y su [procedencia](evidence/2026-10-02-validation/rag-release-candidate-provenance.json)
identifican el árbol de backend comprobado; las correcciones posteriores de
interfaz móvil no modifican ese árbol. La frescura corresponde al índice del
fixture aislado, no a una medición de producción.

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
`/auth/login`; no se transmiten campos adicionales del archivo. CodeQL marcó
las alertas 50/51 como corregidas. La alerta 52 de ese login intencional se
revisó y clasificó como `used in tests`, con fundamento y pruebas en GitHub;
no se excluyó la regla. Los tres hilos están resueltos y quedan cero alertas
abiertas del PR. [Registro](evidence/2026-10-02-validation/codeql-reviewed.json).

La lectura RAG de roles externos queda detrás de
`AI_RAG_EXTERNAL_READ_ENABLED=false` hasta aprobar los gates. La evaluación
local activa el flag sólo en las compañías ficticias.

La publicación requiere CI verde del SHA exacto en main, tag anotado y artefactos
inmutables, migraciones, healthchecks y smoke. Su evidencia se incorporará sólo
después de ejecutarla, conforme al [runbook Kubernetes](../deployment/kubernetes.md).
