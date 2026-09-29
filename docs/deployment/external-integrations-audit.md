# Integraciones externas de release

Revisión realizada el 2026-09-28 con la cuenta propietaria del repositorio.

## GitHub

La [configuración de Rent](https://github.com/andrescastiglia/rent/settings/installations)
lista Cloudflare Workers and Pages, Cursor, Expo, OpenCode Agent,
SonarQubeCloud y Warp Factories. La consulta REST de webhooks del repositorio
no devuelve hooks configurados.

Se revisaron las dos integraciones de publicación externas:

- Cloudflare tiene acceso seleccionado únicamente a `andrescastiglia/rent`,
  con permisos de código, checks, despliegues, PR y administración. En la cuenta
  `acastiglia`, la pantalla **Workers & Pages**, sin filtros, muestra
  **No projects found**. No hay un proyecto que pueda desplegar Rent por push
  en esa cuenta.
- Expo tiene acceso seleccionado a Rent y otro repositorio. El proyecto
  [`@acastiglia/rent`](https://expo.dev/accounts/acastiglia/projects/rent/github)
  está conectado a `andrescastiglia/rent`, con directorio base `/mobile`.
  **EAS Workflows** figura **Unconfigured**. La vista general tampoco registra
  workflows ni despliegues de Hosting. La construcción mediante etiquetas
  `eas-build-[platform]:[profile]` es un disparador explícito de PR y no una
  publicación automática por push a `main`.

No se cambiaron permisos, instalaciones, DNS ni configuración de publicación
durante esta revisión. Tener una GitHub App instalada no demuestra que exista
un proyecto con despliegue automático configurado.

## Release autorizada

El flujo del repositorio sigue siendo `.github/workflows/release.yml`, activado
por tags anotados `vX.Y.Z`. Su preflight exige SHA de `main` con CI satisfactorio,
cero PR abiertos y `main` como única rama remota. Las integraciones externas
deberán revisarse nuevamente si se crea un proyecto Cloudflare, se configura un
workflow EAS o se modifica el acceso de las aplicaciones.

La revisión es evidencia de configuración a la fecha indicada; no sustituye la
validación del tag, artefactos, migraciones y disponibilidad de cada despliegue.
