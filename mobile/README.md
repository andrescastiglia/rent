# Rent Mobile

Aplicación React Native (Expo) para paridad funcional con `frontend`.

## Requisitos

- Node.js 22.22.1+
- npm 10+
- Expo Go o emulador Android/iOS

## Comandos

```bash
npm install
npm run start
npm run android
npm run ios
npm run web
npm run typecheck
npm run e2e:build:android
npm run e2e:test:android
npm run e2e:android
```

## Variables de entorno

- `EXPO_PUBLIC_API_URL` (default: `https://rent.maese.com.ar/api`)
- `EXPO_PUBLIC_MOCK_MODE` (`true|false`)
- `EXPO_PUBLIC_E2E_MODE` (`true|false`) para desactivar share nativo durante Detox.
- `EXPO_PUBLIC_TURNSTILE_SITE_KEY` (requerida para mostrar el widget CAPTCHA en login/register).

## E2E Detox (Android)

Prerrequisitos:

- Android SDK + emulador creado `Pixel_6_API_34`
- Java 17+

Pipeline:

1. `npm run e2e:build:android`
2. Iniciar emulador `Pixel_6_API_34`
3. `npm run e2e:test:android`

Specs incluidas:

- auth + navegación core
- CRUD de properties
- CRUD de tenants
- acciones críticas de lease (render draft, guardar, confirmar, PDF, delete)
- flujo crítico de payments/invoices (create, confirm, receipt PDF, invoice PDF)

## Estado actual

Implementado:

- Arquitectura base Expo + TypeScript + Expo Router.
- Auth con JWT en `expo-secure-store`.
- React Query + i18n (`es/en/pt`) + navegación por rol.
- Tema Sistema/Claro/Oscuro persistente, con paletas coherentes con web, componentes nativos, safe areas, navegación y barra de estado. Ver [sistema visual móvil](docs/design-system.md).
- Pantallas core:
  - Login / Register
  - Dashboard
  - Properties / Tenants / Leases / Payments / Settings
- Pantallas base adicionales:
  - Invoices, Interested, Users, Reports, Templates, Sales, Owners, AI
- Capa API inicial (`src/api/*`) con modo mock y conexión real por `EXPO_PUBLIC_API_URL`.

Los módulos principales incluyen alta, edición, detalle, PDFs compartibles y uploads. Las pruebas unitarias cubren adaptadores, formularios, pantallas, permisos, errores y recuperación; se ejecutan con `npm run test:cov -- --runInBand`.

Android aprobó seis suites y siete recorridos completos en el CI de `f0dcf7e`; iOS conserva fallos de interacción pendientes de revalidación. Detox usa fixtures móviles, mientras que los contratos de API, autorización y dinero se comprueban por separado con HTTP/PostgreSQL reales. La cobertura UT y el smoke de arranque no sustituyen la evidencia por plataforma. Ver [validación de la entrega](../docs/technical/validacion-plan-2026-10-02.md).

### Navegación y recorridos (2026-10-01)

La barra principal contiene **Inicio, Tareas y Más**. Ajustes conserva las preferencias de sesión; los módulos operativos están en Tareas/Más y se filtran por permisos. Propiedades tiene su propia lista, búsqueda remota y paginación; Propietarios permanece separado. Inquilinos, interesados, cobros, facturas, usuarios y ventas preservan `total/page/limit`. Ventas usa búsqueda en servidor y una lista virtualizada; las páginas posteriores abren el mismo detalle nativo. Los selectores antiguos recuperan todas las páginas y fallan explícitamente ante una respuesta incompleta.

El propietario consulta su resumen con importes separados por moneda. El comprador consulta sólo sus ventas, calendario paginado y recibos; el servidor aplica la relación con el usuario. Mantenimiento, administración de ventas/compradores y revisión completa de propuestas ofrecen enlaces explícitos a los recorridos web autorizados. El navegador requiere su propia sesión y nunca recibe el token en el enlace. Configure `EXPO_PUBLIC_WEB_URL` cuando web y API estén en hosts distintos.

La ayuda contextual permanece activa en cada visita: 8 segundos al entrar y 12 después de interacción. Puede pausarse y la preferencia se conserva en almacenamiento seguro. `EXPO_PUBLIC_HELP_INITIAL_MS` y `EXPO_PUBLIC_HELP_TASK_MS` permiten configurar los tiempos. Los campos, selectores y acciones se registran al renderizarse; la ayuda resalta un control habilitado realmente presente y avanza al siguiente requisito sin modificar los datos. Se pausa durante carga, errores, teclado, selectores abiertos y confirmaciones; ninguna sugerencia ejecuta una operación.

Cobros conservan `Idempotency-Key` después de un fallo de red y al reiniciar la app. Un resultado incierto bloquea cambios del mismo intento hasta revisarlo; no hay reenvío automático. Las DTO de acceso, usuarios y propietarios se importan del contrato OpenAPI generado. La cobertura UT mide todo el código propio de `src` y `app`, excepto código generado; las pruebas Android/iOS y la revisión visual real siguen siendo gates independientes.

El workflow reutilizable `mobile-ios.yml` prepara iOS en macOS y compila una sola vez para simulador. Sobre ese mismo binario ejecuta el arranque y todos los recorridos Detox; conserva logs y capturas por plataforma. CI exige también UT, tipos y lint antes de ejecutar Android/iOS. Se puede ejecutar manualmente. La validación iOS usa Xcode 26.3 (Swift ≥6.2) y un simulador Apple; las pruebas nativas usan datos simulados y la autorización real se comprueba por separado con API/PostgreSQL.

El build se limita a la arquitectura del simulador ejecutado. Se guarda el binario
compilado en una caché determinada por Node, paquetes/lock, configuración Expo,
assets, script nativo, Xcode y arquitectura; antes de ejecutarlo se verifican
esos inputs, arquitectura y firma. Metro sirve siempre el JavaScript del checkout actual.
Cambios de JavaScript o pruebas no requieren otro build nativo. La caché se guarda
antes de verificar y ejecutar Detox; no se usa para producción. Un fallo de
verificación bloquea la ejecución. Cuando login/Inicio están listos, Detox restaura en ambas plataformas
la sincronización para esperar navegación, teclado y animaciones. Los campos se
completan con eventos reales de teclado (`clearText/typeText`). La ayuda retira
su contenido al finalizar el gesto y conserva su geometría durante el toque/scroll.

El binario del simulador usa la firma ad hoc local de Xcode, sin certificado de
distribución. Desactivar la firma elimina la identidad que necesita Keychain y
bloquea el guardado de sesión con SecureStore. El script verifica la firma antes
de instalar; Detox usa español/Argentina para mantener deterministas las etiquetas
de las confirmaciones. Referencias: [firma local del simulador](https://developer.apple.com/forums/thread/826882)
y [entitlements de Keychain](https://developer.apple.com/documentation/security/errsecmissingentitlement).

### Corrección nativa de encabezados Android

`npm ci` aplica en `postinstall` el cambio acotado de
[react-native-screens #4498](https://github.com/software-mansion/react-native-screens/pull/4498)
al paquete fijado en 4.25.2. Un encabezado separado de su stack deja de actualizarse
hasta volver a estar asociado; no se elimina la comprobación de navegación ni se
ocultan errores. El instalador es idempotente y falla si cambia la versión o el
fragmento de Kotlin esperado. Revisar y retirar este backport al adoptar una versión
que incorpore la corrección. Cambia el binario Android y exige el gate Detox nativo;
no puede distribuirse sólo como actualización de JavaScript.
