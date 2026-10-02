# Sistema visual de Rent

Actualizado: 2026-10-02. Implementación: [web](../../frontend/src/styles/globals.css),
[tokens móviles](../../mobile/src/config/design-tokens.ts),
[tema móvil](../../mobile/src/contexts/theme-context.tsx) y
[componentes web](../../frontend/src/components/ui/index.ts).
La [guía móvil](../../mobile/docs/design-system.md) detalla las primitivas y su verificación.

## Identidad y tokens

El amarillo `#ffdd55` conserva la identidad de marca. El primario claro `#245b83`
jerarquiza acciones; el amarillo se reserva para marca y orientación. Los estados
siempre incluyen texto, además del color.

- Claro: fondo `#f5f5f2`, superficie `#ffffff`, texto `#202b37`, texto secundario
  `#586574` y borde `#dce2e6`.
- Oscuro: fondo `#141c24`, superficie `#1d2833`, texto `#e9edf1`, texto secundario
  `#b2bdc8`, borde `#3b4b59` y primario `#92c5ef` con texto `#152b3e`.
- Espaciado: 8, 16, 24 y 32 px. Controles de al menos 44 px. Radios: 10 px en
  controles, 14 px en superficies web y 12 px en superficies móviles.
- Tipografía del sistema: cuerpo web de 15 px; móvil de 16 px; etiquetas de
  14 px y títulos de 24–30 px. Importes alineados con cifras tabulares y moneda.
- Foco web: contorno visible de 2 px, separado 3 px. Se respeta movimiento reducido.

En móvil se puede elegir Sistema, Claro u Oscuro desde Ajustes. La preferencia se
conserva en almacenamiento seguro; Sistema sigue los cambios de apariencia del
dispositivo. Las primitivas adaptan estilos existentes sin cambiar dimensiones,
referencias nativas, eventos ni comportamiento de listas virtualizadas.

## Patrones operativos

`PageHeader` presenta título, explicación breve y una acción principal.
`Surface`, `Button`, `FormField`, `Pagination`, `Badge` y `StatePanel` unifican
superficies, acciones, etiquetas, filtros y estados. Los errores incluyen una
acción de recuperación y se distinguen de un conjunto vacío. Los diálogos
controlan foco, Escape y retorno al control que los abrió.

Propiedades permite buscar el inmueble directamente y alternar lista/fotografías.
Personas conserva sus roles y vínculos. Cobros muestra moneda, saldo y conceptos;
contratos organiza revisión, adendas y documentos; ventas separa listado,
calendario y detalle. En tamaños pequeños las tablas permanecen dentro de su
contenedor, sin ensanchar la página.

La navegación agrupa Inicio, Operaciones, Personas y Administración según
permisos. La barra móvil ofrece Inicio, tareas principales y Más; Ajustes conserva
preferencias. El menú cerrado queda fuera de la navegación por teclado.

## Orientación contextual

Las reglas de web y móvil evalúan pantalla, rol, estado y controles habilitados.
Por defecto esperan 8 segundos al entrar y 12 segundos durante una tarea.
Escritura, clic, toque y desplazamiento reinician la espera. Cargas, errores,
envíos y confirmaciones tienen prioridad. La ayuda se puede cerrar o pausar;
no ejecuta operaciones, modifica datos ni desplaza el foco del usuario.

Las pruebas controlan los tiempos, las pausas, los permisos, el cambio de pantalla
y los siguientes pasos. Las capturas y resultados de interacción se registran en
la evidencia de validación; una revisión automatizada no acredita por sí sola
cumplimiento integral de WCAG 2.2 AA.
