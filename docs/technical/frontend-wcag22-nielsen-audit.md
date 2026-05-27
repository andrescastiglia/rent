# Ficha tecnica: auditoria WCAG 2.2 y heuristicas de Nielsen del frontend

## Identificacion

- Proyecto: Rent - Sistema de Gestion Inmobiliaria
- Alcance auditado: `frontend`
- Fecha de ejecucion local: 2026-05-26
- Entorno: Next.js 16.2.6, Chrome 148.0.7778.178, Playwright 1.60.0, axe-core 4.11.4
- Modo de datos: `NEXT_PUBLIC_MOCK_MODE=true`, usuario mock `admin`
- Nivel objetivo usado como referencia: WCAG 2.2 A/AA. Se anotan hallazgos AAA o de buenas practicas cuando impactan la experiencia.

## Marco de referencia

WCAG 2.2 es un estandar tecnico de W3C/WAI para accesibilidad web. WAI organiza WCAG bajo cuatro principios: perceptible, operable, comprensible y robusto; la conformidad se determina por criterios de exito testeables en niveles A, AA y AAA. WCAG 2.2 agrega 9 criterios respecto de 2.1, incluyendo foco no oculto, movimientos de arrastre, tamano minimo de objetivo, ayuda consistente, entrada redundante y autenticacion accesible.

La evaluacion de usabilidad se complemento con las 10 heuristicas de Jakob Nielsen publicadas por Nielsen Norman Group: visibilidad del estado del sistema, correspondencia con el mundo real, control y libertad, consistencia, prevencion de errores, reconocimiento antes que recuerdo, flexibilidad, diseno minimalista, recuperacion de errores y ayuda/documentacion.

Fuentes:

- W3C/WAI, [WCAG 2 Overview](https://www.w3.org/WAI/standards-guidelines/wcag/)
- W3C/WAI, [What's New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- Nielsen Norman Group, [10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/)

## Metodologia

Se ejecutaron pruebas automatizadas con axe-core sobre vistas publicas y autenticadas. Adicionalmente se hizo revision de codigo sobre componentes compartidos, formularios y navegacion. Las pruebas se corrieron en viewport desktop `1366x900` y en un pase movil representativo `390x844`.

Pantallas auditadas:

| Pantalla | Ruta |
| --- | --- |
| Login | `/es/login` |
| Registro | `/es/register` |
| Dashboard | `/es/dashboard` |
| Propiedades | `/es/properties` |
| Nueva propiedad | `/es/properties/new` |
| Inquilinos | `/es/tenants` |
| Nuevo inquilino | `/es/tenants/new` |
| Contratos | `/es/leases` |
| Nuevo contrato | `/es/leases/new` |
| Pagos | `/es/payments` |
| Nuevo pago | `/es/payments/new` |
| Facturas | `/es/invoices` |
| Interesados | `/es/interested` |
| Nuevo interesado | `/es/interested/new` |
| Usuarios | `/es/users` |
| Ajustes | `/es/settings` |
| Plantillas | `/es/templates` |
| Editor de plantillas | `/es/templates/editor?scope=invoice` |
| Mantenimiento | `/es/maintenance` |
| Reportes | `/es/reports` |

Validaciones locales complementarias:

- `npm run lint`: sin errores; 2 warnings no relacionados con accesibilidad.
- `npm run type-check`: sin errores.

Limitaciones:

- No se realizo prueba formal con lectores de pantalla, usuarios reales ni tecnologias asistivas fisicas.
- El panel de AI no se audito abierto porque el modo mock lo expuso deshabilitado.
- Los resultados de axe no equivalen a una declaracion formal de conformidad WCAG; sirven como evidencia tecnica y priorizacion.

## Resultado ejecutivo

El frontend no esta listo para declararse conforme con WCAG 2.2 A/AA. La causa principal son controles de formulario sin nombre accesible en flujos de alta criticidad, especialmente `Nuevo inquilino`, y filtros `select` sin etiqueta en varias paginas de backoffice. Tambien hay deuda transversal en landmarks, jerarquia de encabezados, menus desplegables sin estado accesible y controles visibles solo por hover.

Riesgo global: Alto.

Prioridad recomendada:

1. Corregir labels/nombres accesibles de formularios y filtros.
2. Corregir landmarks, `h1` y estructura de encabezados.
3. Agregar semantica de estado a menus/desplegables y botones que abren paneles.
4. Asegurar foco visible y acciones disponibles por teclado.
5. Conectar errores de validacion con campos y regiones vivas.

## Resumen automatizado

| Regla axe | Impacto | Paginas afectadas | Relacion WCAG |
| --- | --- | --- | --- |
| `label` | Critico | Nuevo inquilino: 20 nodos | 4.1.2 Nombre, funcion, valor |
| `select-name` | Critico | Dashboard, Nuevo inquilino, Pagos, Facturas, Interesados, Nuevo interesado, Plantillas, Editor de plantillas, Mantenimiento | 4.1.2 Nombre, funcion, valor |
| `landmark-one-main` | Moderado | Login, Registro | Buenas practicas; relacionado con 1.3.1 y 2.4.1 |
| `page-has-heading-one` | Moderado | Login, Registro | Buenas practicas; relacionado con 1.3.1 y 2.4.6 |
| `region` | Moderado | Login, Registro | Buenas practicas; relacionado con landmarks |
| `heading-order` | Moderado | Propiedades, Nueva propiedad, Inquilinos, Nuevo inquilino, Contratos, Nuevo contrato, Pagos, Facturas, Nuevo interesado, Plantillas, Editor, Mantenimiento, Reportes | Buenas practicas; relacionado con 1.3.1 |

En Dashboard, axe marco `color-contrast` como `incomplete` por fondos con gradiente o elementos parcialmente superpuestos. No se detecto falla automatica de contraste, pero requiere verificacion manual con los colores finales renderizados.

## Hallazgos

### FT-WCAG-001 - Campos de `TenantForm` sin asociacion programatica de etiqueta

- Severidad: Critica
- Estado: No conforme
- Evidencia: `src/components/tenants/TenantForm.tsx` usa `<label>` sin `htmlFor` y controles sin `id` en campos como nombre, apellido, email, telefono, DNI, CUIL, estado, empleo, direccion, contacto de emergencia y notas.
- Pagina afectada: `/es/tenants/new`
- WCAG: 4.1.2 Nombre, funcion, valor; 1.3.1 Informacion y relaciones; 3.3.2 Etiquetas o instrucciones
- Nielsen: prevencion de errores; reconocimiento antes que recuerdo; recuperacion de errores
- Impacto: usuarios de lector de pantalla no reciben el nombre correcto del campo. Herramientas de autocompletado, dictado o navegacion por formulario tambien pierden contexto.
- Recomendacion: asignar `id` estable a cada input/select/textarea y conectar `label htmlFor`. Para errores, agregar `aria-invalid`, `aria-describedby` y mensajes con `id`.

Ejemplo de patron:

```tsx
<label htmlFor="tenant-first-name" className={labelClass}>
  {t("fields.firstName")}
</label>
<input
  id="tenant-first-name"
  {...register("firstName")}
  aria-invalid={Boolean(errors.firstName)}
  aria-describedby={errors.firstName ? "tenant-first-name-error" : undefined}
  className={inputClass}
/>
```

### FT-WCAG-002 - Filtros `select` sin nombre accesible

- Severidad: Critica
- Estado: No conforme
- Evidencia automatizada: `select-name` en 9 pantallas.
- Paginas afectadas: `/es/dashboard`, `/es/tenants/new`, `/es/payments`, `/es/invoices`, `/es/interested`, `/es/interested/new`, `/es/templates`, `/es/templates/editor?scope=invoice`, `/es/maintenance`
- WCAG: 4.1.2 Nombre, funcion, valor; 1.3.1 Informacion y relaciones
- Nielsen: reconocimiento antes que recuerdo; consistencia y estandares
- Impacto: al llegar al control, una tecnologia asistiva puede anunciar solo "combo box" u opciones, sin explicar que filtra.
- Evidencia de codigo: `src/app/[locale]/payments/page.tsx` contiene filtros de propiedad, contrato, actividad y estado sin label; `src/app/[locale]/invoices/page.tsx` tiene filtro de estado sin label; `src/app/[locale]/maintenance/page.tsx` tiene selector de estado en tarjeta sin label.
- Recomendacion: agregar labels visibles o `sr-only` y conectar con `htmlFor`. Usar `aria-label` solo cuando una etiqueta visible no sea viable.

### FT-WCAG-003 - Login y registro sin landmark principal ni `h1`

- Severidad: Media
- Estado: No conforme parcial / deuda estructural
- Evidencia automatizada: `landmark-one-main`, `page-has-heading-one`, `region` en `/es/login` y `/es/register`.
- WCAG: 1.3.1 Informacion y relaciones; 2.4.1 Evitar bloques; 2.4.6 Encabezados y etiquetas
- Nielsen: consistencia y estandares; reconocimiento antes que recuerdo
- Impacto: usuarios que navegan por landmarks o encabezados no tienen punto claro de inicio del contenido.
- Evidencia de codigo: `src/app/[locale]/(auth)/layout.tsx` renderiza contenedores `div` sin `<main>`; login y registro usan `h2` como titulo principal.
- Recomendacion: envolver `{children}` en `<main>` y cambiar el titulo principal de login/registro a `h1`.

### FT-WCAG-004 - Jerarquia de encabezados inconsistente en paginas autenticadas

- Severidad: Media
- Estado: Deuda transversal
- Evidencia automatizada: `heading-order` en 13 pantallas.
- WCAG: relacionado con 1.3.1 y navegacion por encabezados
- Nielsen: consistencia y estandares; diseno estetico y minimalista
- Impacto: el salto de `h1` a `h3` reduce la utilidad del mapa de encabezados en lectores de pantalla.
- Evidencia de codigo: `src/components/layout/Footer.tsx` usa `h3` para secciones del footer. En paginas con un solo `h1`, el footer introduce saltos. Tambien hay secciones de formularios que comienzan en `h3` sin `h2` intermedio.
- Recomendacion: definir una escala semantica comun. Opciones: usar `h2` para secciones principales del contenido, convertir titulos puramente visuales del footer en `p`/`strong`, o agregar un `h2` visualmente oculto que agrupe el footer.

### FT-WCAG-005 - Menus desplegables y toggles sin estado accesible

- Severidad: Alta
- Estado: No conforme parcial
- Evidencia de codigo: `src/components/layout/Header.tsx` abre menu de usuario sin `aria-expanded`, `aria-haspopup` ni `aria-controls`. `src/components/ui/LanguageSelector.tsx` abre selector de idioma sin esos estados. El boton AI tambien alterna un panel, pero solo expone `aria-label`.
- WCAG: 4.1.2 Nombre, funcion, valor; 2.4.3 Orden del foco; 2.4.7 Foco visible
- Nielsen: visibilidad del estado del sistema; control y libertad; consistencia
- Impacto: usuarios de lector de pantalla no saben si el menu esta abierto, que tipo de popup se abrio, ni que elemento controla.
- Recomendacion: agregar `aria-expanded={isOpen}`, `aria-haspopup="menu"` cuando corresponda, `aria-controls`, `id` en el panel, cierre con `Escape` y gestion de foco al abrir/cerrar.

### FT-WCAG-006 - Boton de menu movil con etiqueta incorrecta

- Severidad: Alta
- Estado: No conforme parcial
- Evidencia de codigo: en `src/components/layout/Header.tsx`, el boton hamburguesa que abre el menu usa `aria-label={t("closeMenu")}`.
- WCAG: 4.1.2 Nombre, funcion, valor; 2.5.3 Etiqueta en el nombre
- Nielsen: correspondencia entre sistema y mundo real; prevencion de errores
- Impacto: un usuario de lector de pantalla escucha "cerrar menu" cuando la accion real es abrirlo.
- Recomendacion: alternar etiqueta y estado: `aria-label={sidebarOpen ? t("closeMenu") : t("openMenu")}` y `aria-expanded={sidebarOpen}`. Para eso `Header` necesita recibir `sidebarOpen`.

### FT-WCAG-007 - Accion de eliminar imagen visible solo por hover

- Severidad: Alta
- Estado: Riesgo de operabilidad
- Evidencia de codigo: `src/components/properties/ImageUpload.tsx` oculta el boton de eliminar con `opacity-0 group-hover:opacity-100`.
- WCAG: 2.1.1 Teclado; 2.4.7 Foco visible; 2.4.11 Foco no oculto (WCAG 2.2 AA); 2.5.8 Tamano del objetivo (WCAG 2.2 AA, a verificar segun render final)
- Nielsen: visibilidad del estado; control y libertad
- Impacto: si el boton recibe foco por teclado, puede quedar visualmente invisible porque solo se revela en hover. En tactil no hay hover.
- Recomendacion: hacerlo visible siempre o agregar `focus:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2`; asegurar area minima de 24x24 CSS px o separacion equivalente.

### FT-WCAG-008 - Mensajes de error no conectados sistematicamente con controles

- Severidad: Media-Alta
- Estado: Deuda de formularios
- Evidencia de codigo: en `TenantForm`, los errores se renderizan como `<p>` despues del campo, pero los controles no tienen `aria-invalid` ni `aria-describedby`. El patron se repite en varios formularios aunque algunos campos si tienen `id`.
- WCAG: 3.3.1 Identificacion de errores; 3.3.3 Sugerencias ante errores; 4.1.3 Mensajes de estado
- Nielsen: reconocer, diagnosticar y recuperarse de errores
- Impacto: el error puede ser visualmente cercano pero no anunciado al navegar campo por campo.
- Recomendacion: centralizar un componente `Field`/`FormControl` que genere `id`, `label`, `aria-invalid`, `aria-describedby`, texto de ayuda y error. Para errores globales, usar `role="alert"` o region `aria-live`.

### FT-WCAG-009 - Busquedas y filtros dependen demasiado de placeholder u opcion inicial

- Severidad: Media
- Estado: Mejora recomendada
- Evidencia: busquedas en pagos, facturas, interesados, contratos e inquilinos usan placeholder como indicacion principal; varios selects usan la primera opcion como pseudo-label.
- WCAG: 2.4.6 Encabezados y etiquetas; 3.3.2 Etiquetas o instrucciones
- Nielsen: reconocimiento antes que recuerdo; flexibilidad y eficiencia
- Impacto: el placeholder desaparece al escribir y no siempre cumple como instruccion persistente. La primera opcion de un select no equivale a nombre accesible.
- Recomendacion: agregar etiquetas visibles o `sr-only` persistentes para cada filtro y mantener placeholder solo como ejemplo.

### FT-WCAG-010 - Contraste en superficies con gradientes requiere verificacion manual

- Severidad: Media
- Estado: Inconcluso
- Evidencia automatizada: axe marco `color-contrast` como `incomplete` en Dashboard por no poder determinar fondo en gradientes o contenido parcialmente superpuesto.
- WCAG: 1.4.3 Contraste minimo; 1.4.11 Contraste no textual
- Nielsen: diseno estetico y minimalista
- Impacto: no hay fallo automatico confirmado, pero las superficies con gradiente pueden variar mucho entre temas claro/oscuro y navegadores.
- Recomendacion: verificar contraste con herramienta manual sobre capturas reales. Evitar texto gris/ambar/verde sobre gradientes si no se garantiza ratio 4.5:1 para texto normal y 3:1 para texto grande o componentes no textuales.

## Matriz Nielsen

| Heuristica | Observacion | Riesgo |
| --- | --- | --- |
| Visibilidad del estado del sistema | Menus y paneles no exponen `aria-expanded`; accion de eliminar imagen solo aparece por hover. | Alto |
| Correspondencia con el mundo real | Boton movil anuncia "cerrar menu" cuando abre el menu. | Alto |
| Control y libertad del usuario | Dropdowns no gestionan escape/foco de forma explicita; eliminar imagen no es obvio por teclado/tactil. | Medio-Alto |
| Consistencia y estandares | Formularios mezclan labels correctos con labels no asociados; filtros usan patrones distintos. | Alto |
| Prevencion de errores | Falta conexion programatica entre campo, ayuda y error. | Alto |
| Reconocimiento antes que recuerdo | Filtros dependen de placeholders y opciones iniciales; controles sin nombre accesible. | Alto |
| Flexibilidad y eficiencia | No se observaron atajos o mejoras para usuarios expertos; no es bloqueante para WCAG. | Bajo |
| Diseno estetico y minimalista | Hay buena limpieza visual, pero el uso semantico de headings no acompana la estructura visual. | Medio |
| Reconocer, diagnosticar y recuperarse de errores | Mensajes no estan sistematicamente anunciados ni asociados a campos. | Medio-Alto |
| Ayuda y documentacion | No se audito ayuda contextual consistente. WCAG 2.2 incluye ayuda consistente cuando existe; no se detecto un patron global. | Bajo-Medio |

## Plan de remediacion sugerido

### Sprint 1 - Bloqueantes WCAG

- Corregir `TenantForm` completo con labels programaticos, `aria-invalid` y `aria-describedby`.
- Corregir todos los `select` de filtros con `label` visible o `sr-only`.
- Agregar `<main>` y `h1` en login/registro.
- Reparar etiqueta/estado del menu movil.

### Sprint 2 - Patrones compartidos

- Crear un componente reusable `FormField` o helper de IDs para inputs/selects/textarea.
- Crear componente `FilterSelect` con label y estilos compartidos.
- Crear componente `DropdownButton` con `aria-expanded`, `aria-controls`, `Escape` y gestion de foco.
- Ajustar `ImageUpload` para teclado/tactil y foco visible.

### Sprint 3 - Verificacion y regresion

- Incorporar pruebas e2e de accesibilidad con axe-core para rutas criticas.
- Agregar tests de teclado para abrir/cerrar menus, navegar dropdowns y operar carga/eliminacion de imagenes.
- Verificar contraste manual de Dashboard en tema claro y oscuro.
- Documentar checklist WCAG 2.2 A/AA para PRs de frontend.

## Criterio de aceptacion

Se recomienda no declarar conformidad WCAG 2.2 AA hasta que:

- No existan violaciones axe criticas/serias en las rutas auditadas.
- Los formularios criticos tengan nombres accesibles, instrucciones y errores asociados.
- Login/registro y paginas autenticadas tengan landmark principal y estructura de encabezados consistente.
- Menus, paneles y acciones dinamicas expongan estado y sean operables por teclado.
- Se haya hecho verificacion manual de contraste y foco en desktop y mobile.
