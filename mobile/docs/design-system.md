# Sistema visual móvil

La aplicación conserva la identidad de web y adapta los componentes al entorno nativo. Los tokens base se definen en `src/config/design-tokens.ts`; las paletas y la preferencia se resuelven en `src/contexts/theme-context.tsx`.

En claro, la acción principal usa `#245b83`, el fondo `#f5f5f2`, las superficies `#ffffff` y la marca `#ffdd55`. El texto principal es `#202b37`, el secundario `#586574` y los bordes `#dce2e6`.

En oscuro, el fondo usa `#141c24`, las superficies `#1d2833`, el texto `#e9edf1`, el secundario `#b2bdc8`, los bordes `#3b4b59` y la acción principal `#92c5ef`. Su texto usa `#152b3e`, adecuado para ese fondo claro. Éxito, advertencia y error tienen tokens independientes para texto y superficie; conservan su significado al cambiar de tema.

## Selección y persistencia

Ajustes ofrece Sistema, Claro y Oscuro, traducidos a español, inglés y portugués. Sistema sigue `useColorScheme`, incluidos los cambios de apariencia mientras la aplicación está abierta. Una apariencia no especificada usa claro. La preferencia explícita se guarda en `expo-secure-store` bajo `rent.theme.preference`; restaurar el almacenamiento nunca sustituye una elección más reciente. Un fallo de almacenamiento conserva el tema activo.

El proveedor rodea autenticación y navegación. Safe areas, cabeceras, barra de pestañas y superficies usan la paleta activa. La barra de estado cambia el color de sus símbolos. Los campos adaptan texto, placeholder, superficie y teclado; el selector nativo de fechas y el CAPTCHA embebido reciben el tema seleccionado.

## Componentes y ejemplos

- `src/components/themed-native.tsx` aplica roles semánticos a las primitivas nativas, preservando geometría, referencias, estilos dinámicos y datos ingresados. Los estilos anteriores reconocidos se traducen a esos roles; los colores específicos ajenos a la paleta se conservan.
- `src/components/ui.tsx` centraliza campos, botones, tarjetas y selectores; los objetivos táctiles siguen los tokens de tamaño. La ayuda resalta el control habilitado mediante el borde de acción principal.
- `src/components/screen.tsx` aplica el fondo de pantalla y las safe areas. Carga, error, vacío y reintento conservan estados explícitos.
- `app/(app)/(tabs)/home.tsx`, `tasks.tsx` y `more.tsx` muestran Inicio, Tareas y Más. Las listas de propiedades, inquilinos y ventas, sus detalles, cobros y AI consumen las mismas primitivas. AI distingue mensajes propios con texto sobre la superficie de acción principal.

## Verificación

`src/contexts/theme-context.spec.tsx` verifica cambios del sistema, selección explícita, restauración, errores y carreras de almacenamiento; también comprueba los colores efectivos de campos, tarjetas, acciones, safe areas y CAPTCHA. `navigation-flow.spec.tsx` verifica el selector real de Ajustes y `secondary-flow.spec.tsx`, la barra de estado y la navegación.

Los pares de texto y superficie de cuerpo, ayuda, acción principal, éxito, advertencia y error se comprueban numéricamente con contraste WCAG AA de al menos 4,5:1 en ambas paletas. Las UT no prueban la composición visual en un dispositivo. Las capturas, recorridos Android/iOS, foco y lector de pantalla se validan por separado en los workflows móviles y la revisión de plataforma.
