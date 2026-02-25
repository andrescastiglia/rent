# Rent Mobile

Aplicación React Native (Expo) para paridad funcional con `frontend`.

## Requisitos

- Node.js 20+
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
- Pantallas core:
  - Login / Register
  - Dashboard
  - Properties / Tenants / Leases / Payments / Settings
- Pantallas base adicionales:
  - Invoices, Interested, Users, Reports, Templates, Sales, Owners, AI
- Capa API inicial (`src/api/*`) con modo mock y conexión real por `EXPO_PUBLIC_API_URL`.

Pendiente (siguientes fases):

- CRUDs completos por módulo (alta/edición/borrado con formularios full).
- Descarga/share de PDFs (recibos, facturas, contratos) con `expo-file-system` y `expo-sharing`.
- Upload de imágenes/documentos con `expo-image-picker`.
- Flujos críticos end-to-end equivalentes a specs web (payments/leases/invoices/interested/users/templates).
- Tests automatizados de UI móvil.
