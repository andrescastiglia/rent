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

Pendiente de validación por plataforma: ejecutar los recorridos completos Android/iOS contra API y PostgreSQL reales, conservar capturas a los anchos definidos y revisar accesibilidad con teclado y lector de pantalla. La cobertura UT y el smoke de arranque no sustituyen esa evidencia.

### Navegación y recorridos (2026-10-01)

La barra principal contiene **Inicio, Tareas y Más**. Ajustes conserva las preferencias de sesión; los módulos operativos están en Tareas/Más y se filtran por permisos. Propiedades tiene su propia lista, búsqueda remota y paginación; Propietarios permanece separado. Inquilinos, interesados, cobros, facturas, usuarios y ventas preservan `total/page/limit`. Ventas usa búsqueda en servidor y una lista virtualizada; las páginas posteriores abren el mismo detalle nativo. Los selectores antiguos recuperan todas las páginas y fallan explícitamente ante una respuesta incompleta.

El propietario consulta su resumen con importes separados por moneda. El comprador consulta sólo sus ventas, calendario paginado y recibos; el servidor aplica la relación con el usuario. Mantenimiento, administración de ventas/compradores y revisión completa de propuestas ofrecen enlaces explícitos a los recorridos web autorizados. El navegador requiere su propia sesión y nunca recibe el token en el enlace. Configure `EXPO_PUBLIC_WEB_URL` cuando web y API estén en hosts distintos.

La ayuda contextual permanece activa en cada visita: 8 segundos al entrar y 12 después de interacción. Puede pausarse y la preferencia se conserva en almacenamiento seguro. `EXPO_PUBLIC_HELP_INITIAL_MS` y `EXPO_PUBLIC_HELP_TASK_MS` permiten configurar los tiempos. Los campos, selectores y acciones se registran al renderizarse; la ayuda resalta un control habilitado realmente presente y avanza al siguiente requisito sin modificar los datos. Se pausa durante carga, errores, teclado, selectores abiertos y confirmaciones; ninguna sugerencia ejecuta una operación.

Cobros conservan `Idempotency-Key` después de un fallo de red y al reiniciar la app. Un resultado incierto bloquea cambios del mismo intento hasta revisarlo; no hay reenvío automático. Las DTO de acceso, usuarios y propietarios se importan del contrato OpenAPI generado. La cobertura UT mide todo el código propio de `src` y `app`, excepto código generado; las pruebas Android/iOS y la revisión visual real siguen siendo gates independientes.

El workflow reutilizable `mobile-ios.yml` prepara iOS en macOS y compila una sola vez para simulador. Sobre ese mismo binario ejecuta el arranque y todos los recorridos Detox; conserva logs y capturas por plataforma. CI exige también UT, tipos y lint antes de ejecutar Android/iOS. Se puede ejecutar manualmente. La validación iOS requiere Xcode y un simulador Apple; las pruebas nativas usan datos simulados y la autorización real se comprueba por separado con API/PostgreSQL.
