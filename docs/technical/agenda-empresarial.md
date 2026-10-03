# Agenda empresarial

La agenda comparte los compromisos de una empresa entre sus usuarios internos activos. La asignación identifica quién recibe el recordatorio; no limita la lectura ni concede permisos de los módulos de origen.

## Entrega

1. **Agenda y compatibilidad:** migraciones 143/144, tareas con historial, programación civil o temporal, responsable y persona opcionales, comandos idempotentes y control de versión. Los triggers mantienen la misma actividad entre CRM y agenda. Las comunicaciones con `visitId`/`deliveryId` y las notas no generan tareas adicionales.
2. **WhatsApp y web:** las herramientas de agenda reutilizan propuestas y recibos existentes. El mensaje entrante se incorpora al contexto de ejecución y a la propuesta. Otro revisor autorizado debe reautenticarse antes de ejecutarla. La web incluye campana, bandeja persistente, preferencias independientes y suscripciones Web Push.
3. **Calendario móvil:** integración con las clases actuales de `expo-calendar` para Expo 56. La persona opta por crear un calendario local dedicado. Rent actualiza sus eventos y alarmas al abrir, volver al primer plano o refrescar la agenda.

## Datos y permisos

`agenda_tasks` es la fuente de las tareas manuales y CRM. `agenda_history` conserva versiones y las referencias originales; las actividades existentes permanecen en sus tablas. `agenda_entries` refleja visitas, mantenimiento, contratos y facturas. Las cuotas de venta usan el cálculo de `SalesService.getSchedule`, incluyendo cobros registrados.

Los vencimientos se completan por las operaciones de sus módulos. Una tarea de seguimiento relacionada no cambia el saldo ni completa una visita. Las preferencias de responsable y alarma de los compromisos reflejados están en `agenda_entry_settings`, con historial separado.

Los perfiles de persona provienen de interesados, propietarios, inquilinos, compradores y usuarios internos existentes. Una persona eliminada no impide abrir o completar la tarea autorizada. No se crea un maestro adicional de contactos.

Todos los endpoints requieren empresa y rol interno. Las actividades vinculadas conservan el permiso del módulo correspondiente. Los comandos requieren `Idempotency-Key` UUID; las modificaciones de tareas requieren `version` numérica, y los ajustes de compromisos derivados requieren la versión completa devuelta por la API.

## API

- `GET /agenda`, `/agenda/config`, `/agenda/people`, `/agenda/staff`.
- `GET /agenda/people/:type/:id`, `/agenda/entries/:id`, `/agenda/entries/:id/history`.
- `POST /agenda/tasks`, `PATCH /agenda/entries/:id`, `PATCH /agenda/entries/:id/settings`.
- `GET /notifications/web`, `/notifications/web/preferences`, `/notifications/web/config`.
- `PATCH /notifications/web/preferences`; `POST /notifications/web/:id/read`.
- `GET /notifications/web/:id/destination`; alta y baja de suscripciones en `/notifications/web/subscriptions` y `/notifications/web/subscriptions/remove`.

Los identificadores incluyen su origen: `task:<uuid>`, `visit:<uuid>`, `maintenance:<uuid>`, `lease:<uuid>`, `invoice:<uuid>`, `sale:<uuid>:<cuota>`. El listado admite rango civil, texto, persona, responsable, tipo, estado, `unscheduled=true`, página y límite.

Los enlaces de los avisos resuelven el destino en el servidor dentro de la empresa actual. La web recupera ese destino tras autenticarse. Las propuestas abren `/agenda/proposals/:id`, con permiso `approvals` independiente del acceso al dashboard. Marcar un aviso como leído no cambia la tarea. Mantenimiento y ventas cuentan también con rutas de detalle directas.

## Operación

Aplicar 143 y 144 con el runner de migraciones habitual antes de publicar los servicios. El worker de comunicaciones existente, programado cada minuto, llama además a `POST /notifications/internal/process-agenda`, usando `BATCH_COMMUNICATIONS_INTERNAL_TOKEN`.

Configurar opcionalmente en el entorno privado del backend:

```dotenv
WEB_PUSH_VAPID_PUBLIC_KEY=<publica>
WEB_PUSH_VAPID_PRIVATE_KEY=<privada>
WEB_PUSH_VAPID_SUBJECT=mailto:administracion@example.com
```

Generar el par una sola vez con `web-push.generateVAPIDKeys()`. Conservarlo entre publicaciones; una rotación requiere renovar las suscripciones. La clave privada nunca se expone al frontend. Sin claves, funcionan la agenda, la bandeja y las preferencias; la activación de Push informa que falta configurar el servicio.

Cada aviso y su entrega quedan persistidos antes del envío. La clave única incluye empresa, compromiso, versión, evento y destinatario. Las entregas se reclaman con bloqueo y lease; hay cinco intentos con espera exponencial. Los códigos 404/410 retiran la suscripción. Cambios de versión, asignación, cancelación o finalización invalidan los avisos anteriores; la entrega vuelve a comprobar vigencia, destinatario y preferencias.

Diagnóstico de entregas agotadas:

```sql
SELECT status, count(*) FROM web_push_deliveries GROUP BY status;
SELECT notification_id, attempts, next_attempt_at
FROM web_push_deliveries WHERE status='failed' AND attempts>=5;
```

La bandeja continúa disponible cuando el navegador no admite Push o se deniega el permiso. La activación exige una acción del usuario. El service worker valida rutas del mismo origen y abre o enfoca Rent. El cierre explícito de sesión retira la suscripción del usuario y del navegador.

## Calendario y horarios

Los valores iniciales se configuran en `companies.settings`:

```json
{"timezone":"America/Argentina/Buenos_Aires","agenda":{"reminderMinutes":15,"reminderHour":9}}
```

La zona debe ser IANA válida; minutos entre 0 y 10080 y hora entre 0 y 23. Estos valores se usan para nuevas tareas y para compromisos derivados sin ajustes propios. Una tarea sin fecha no genera recordatorio temporal.

El calendario refleja compromisos pendientes entre treinta días anteriores y 366 días posteriores a la fecha actual de la empresa. Guarda el identificador nativo y la última sincronización por usuario/empresa, y recupera correspondencias mediante marcadores para evitar duplicados tras una interrupción. Las tareas asignadas a otro usuario permanecen visibles, sin alarmas para quien sincroniza.

Primero descarga todas las páginas; si falla la conexión, conserva el reflejo anterior. Actualiza valores externos en la siguiente sincronización y retira eventos completados o cancelados. Al desactivar o cerrar sesión elimina únicamente su calendario dedicado. Si el sistema revoca el permiso, informa la imposibilidad de retirarlo.

En Android las fechas sin hora se almacenan como días completos a medianoche UTC; el desplazamiento de alarma compensa la zona del dispositivo para conservar la hora de la empresa. En iOS se usa una alarma absoluta. Al cambiar la zona del dispositivo, abrir o refrescar Rent vuelve a calcular los desplazamientos. La presentación de alarmas depende también del calendario y de los permisos del sistema.

## Compilación móvil

`postinstall` aplica un parche acotado a `expo-calendar` 56.0.10: convierte los indicadores booleanos Android a 0/1 y corrige el signo entre `relativeOffset` y los minutos anteriores de CalendarProvider. `expo.autolinking.android.buildFromSource` incluye únicamente este módulo para que el parche se compile. El script falla ante otra versión y debe revisarse al actualizar la dependencia. Véanse el [código del SDK 56](https://github.com/expo/expo/tree/sdk-56/packages/expo-calendar/android/src/main/java/expo/modules/calendar/next) y la [compilación desde fuentes](https://docs.expo.dev/guides/prebuilt-expo-modules/).

La exportación usa el watcher explícito de `shared/` y desactiva `experiments.onDemandFilesystem`; así las compilaciones incluyen las utilidades compartidas fuera del directorio móvil.

## Verificación

- Integración PostgreSQL: idempotencia y concurrencia, compatibilidad CRM, aislamiento, asignación, destinos, aprobación de WhatsApp, lectura sin permisos financieros y migración repetible.
- Regresiones de IA, WhatsApp, notificaciones, navegación, autenticación y mantenimiento.
- Fechas civiles y cambios de horario estacional.
- Navegador Chromium: lista, bandeja, clic a detalle sin persona y posición de la bandeja en escritorio y ancho móvil; datos de API simulados.
- Calendario: alta sin duplicados, restauración de cambios externos, conservación sin conexión, eliminación selectiva, permiso denegado y alarmas Android/iOS.
- Compilación Next.js, generación OpenAPI, exportación Android/iOS y compilación nativa Android.
- Ejecución de calendario en emulador Android: creación, deduplicación, alarmas, restauración, reprogramación y cancelación.

La prueba nativa aislada está en `mobile/e2e/native-agenda-smoke.tsx`. Para repetirla en una compilación de desarrollo, registrar ese componente temporalmente con `registerRootComponent` en `index.js`, iniciar Metro con `EXPO_PUBLIC_E2E_MODE=true` (en Android sin dev client, habilitar temporalmente `useDevSupport = BuildConfig.DEBUG` en el host generado) y restaurar el host e `index.js` al terminar. Usa datos ficticios, verifica el módulo nativo real y retira su calendario en `finally`. Se comprobó también que CalendarProvider conserva `minutes=15` para el aviso quince minutos antes.

La compilación y ejecución nativa iOS requieren macOS/Xcode. La recepción real de Push con la pestaña cerrada debe verificarse en el despliegue HTTPS con VAPID configurado y en navegadores compatibles. Estas comprobaciones no se sustituyen por simulaciones de envío.

No incluye recurrencias manuales ni sincronización bidireccional.

Referencias: [Expo Calendar 56](https://docs.expo.dev/versions/v56.0.0/sdk/calendar/), [Web Push y ejecución en segundo plano](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation), [apertura desde notificaciones](https://developer.mozilla.org/en-US/docs/Web/API/Clients/openWindow), [alarmas de días completos en Android](https://android.googlesource.com/platform/packages/providers/CalendarProvider/+/master/src/com/android/providers/calendar/CalendarAlarmManager.java).
