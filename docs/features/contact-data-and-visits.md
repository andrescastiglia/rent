# Direcciones, teléfonos y asistencia a visitas

La implementación se habilita en tres etapas. Los registros anteriores conservan sus campos; no se consulta ningún proveedor durante una migración, importación o guardado sin normalización. El teléfono original se mantiene separado de E.164, país, extensión y fecha. Cambiarlo invalida sus resultados, incluidos los perfiles vinculados al usuario.

## Activación

1. Aplicar `migrations/145_contact_data_and_geography.sql` mediante el runner habitual. PostgreSQL necesita PostGIS instalado; el contenedor PostGIS del proyecto ya lo incluye. La migración activa la extensión, agrega puntos `geography(Point,4326)` generados y cuatro índices GiST parciales. Los pares de coordenadas fuera de rango no generan puntos.
2. Habilitar `CONTACT_NORMALIZATION_ENABLED=true`. Configurar `GEO_USER_AGENT` con nombre, versión y un contacto real de la aplicación, por ejemplo `Rent/1.0 (https://dominio-propio/contacto)`. Las propuestas de Nominatim se firman con `CONTACT_DATA_SIGNING_SECRET` o, si no está definido, `JWT_SECRET`. Guardar un candidato requiere su firma y el domicilio y empresa originales. Cada teléfono usa `google-libphonenumber` en backend, sin llamadas externas; Argentina es la región inicial del selector.
3. Para imágenes y ETA, habilitar `GEO_MAPS_ENABLED=true`. Crear una cuenta/key de ArcGIS con privilegio Static Maps y **desactivar PAYG en la cuenta**. Configurar `ARCGIS_STATIC_MAPS_KEY`, `ARCGIS_PAYG_DISABLED=true`, `ARCGIS_FREE_IMAGE_LIMIT` (900 por defecto; máximo 1000) y `ARCGIS_BILLING_CYCLE_DAY` según el ciclo de esa cuenta. Usar una cuenta/key dedicada: consumo realizado fuera de Rent no entra en su contador. La variable es una declaración del operador; no modifica la facturación de ArcGIS. Sin key, declaración o cuota disponible, se muestra una alternativa sin imagen.
4. Para asistencia móvil, habilitar `GEO_PROXIMITY_ENABLED=true` y generar nuevos binarios Android/iOS después de `npx expo prebuild`. Android usa el módulo Expo local `mobile/modules/rent-proximity`; iOS usa `expo-widgets` y un App Group generado por su plugin. No funciona en Expo Go. Desde Ajustes → Asistencia a visitas y widget, el usuario activa la función y concede permisos de ubicación, incluyendo segundo plano. Después agrega el widget desde la pantalla de inicio del sistema.

Los tres indicadores están apagados por defecto en `.env.example`. No se requieren servidores geográficos propios. Los mapas de propietarios e inquilinos externos se restringen a sus domicilios y propiedades vinculadas; agenda, búsqueda de contactos, proximidad y CRM se reservan al personal con los permisos correspondientes.

## Funcionamiento

- Web y móvil comparten la previsualización telefónica autenticada. Aceptar una propuesta agrega `normalization.phones` y `phoneOriginals` al guardado; backend vuelve a calcularla. Números incompletos permanecen guardables sin normalizar. Prefijos internacionales prevalecen sobre la región seleccionada. No se agrega un `9` a un teléfono fijo ni se fusionan personas por compartir número.
- Nominatim se consulta mediante un botón y confirmación de domicilio público. La búsqueda estructurada contiene calle, altura, localidad, provincia, país y código postal; nunca piso, departamento, nombre, teléfono ni campos CRM. Las propuestas se reutilizan desde una caché por empresa durante 30 días. No hay autocompletado ni lotes. Los candidatos sin altura identificada se muestran como aproximados y no generan cercanía inminente.
- Cambiar la ubicación invalida la propuesta y coordenadas; piso/departamento mantienen el punto. Además del backend, triggers cubren cambios realizados por SQL y teléfonos compartidos entre perfiles. Las coordenadas existentes válidas generan GIS directamente.
- La ficha carga la imagen ArcGIS al entrar en pantalla. Backend la transmite con `Cache-Control: no-store`; web usa un blob que revoca al desmontar y móvil un data URI en memoria. No se escriben imágenes en archivos, DB, objetos, widgets ni cachés de optimización de Next.
- Al pulsar la imagen o abrir una visita desde una notificación, se calcula ETA con ubicación reciente. Auto es el valor inicial; caminata y bicicleta usan sus servicios OSRM correspondientes. La ETA no considera tráfico. Un error de permisos/ruta mantiene la acción explícita de Google Maps; en móvil se incluye `dir_action=navigate` y alternativa web.
- Las visitas de propiedades resuelven su propia propiedad. Otras visitas de agenda permiten seleccionar un lugar registrado o usar el domicilio del contacto. Avisos y calendario mantienen el mismo ID de compromiso.
- Proximidad usa `ST_DWithin`/`ST_Distance` y permisos por módulo. Valores iniciales: cinco lugares en 2 km, entrada a 100 m y salida a 150 m. `companies.settings.geo` permite `radius`, `imminentRadius` y `exitRadius`; la salida se mantiene por encima de la entrada.
- Se consideran domicilios directos, propietarios de propiedades, contratos activos y visitas del día en la zona de la empresa. Cuando hay varias personas, se elige destinatario dentro de la app. Sólo se confirma cercanía inminente con precisión de hasta 50 m y ubicación reciente. El backend rechaza orígenes de más de dos minutos o precisión superior a 200 m.
- El widget conserva sólo la última instantánea de texto, con expiración de cinco minutos y cantidades adaptadas al tamaño. En iOS, la activación también permite leer el token y la instantánea desde el llavero de este dispositivo después del primer desbloqueo; desactivar restaura el acceso del token sólo mientras está desbloqueado. El sistema registra como máximo 20 geocercas. No se registran recorridos en backend. Cerrar sesión, cambiar empresa o desactivar limpia instantáneas y geocercas. El sistema operativo puede retrasar o suspender actualizaciones.
- “Avisar que llegué” abre WhatsApp con texto preparado y envío manual. El teléfono validado se usa sin `+` ni extensión. Se utiliza también la normalización del usuario vinculado cuando el perfil no tiene una propia. Si falta normalización se analiza localmente el original; si es ambiguo se pide completarlo desde la ficha. Sólo se registra `arrival_whatsapp_opened`, con `sent:false`. Validez telefónica no acredita cuenta WhatsApp.

## Límites y observabilidad

Nominatim y OSRM reservan un único cupo global por segundo en PostgreSQL, compartido entre todas las réplicas. Las solicitudes adicionales reciben 429; los resultados OSRM equivalentes se reutilizan hasta 60 segundos en memoria. El contador ArcGIS es global por ciclo y reserva conservadoramente antes de cada intento, incluidos errores. No hay reintentos automáticos que consuman imágenes.

`geo_provider_requests_total{provider,outcome}` mide reservas, caché, errores, límites y cuota agotada. Las etiquetas no contienen empresas, personas, teléfonos ni ubicaciones. Se suprimen trazas de llamadas geográficas salientes y de las operaciones de datos de contacto. Mantener la misma política en proxies y sistemas externos de observabilidad.

## Verificación

Pruebas unitarias: teléfonos argentinos y extranjeros, extensiones, posibilidad/validez, independencia de normalización, propuestas firmadas, invalidación, caché, límites, cuota, ETA y navegación ante errores. Pruebas de clientes comprueban aceptación explícita, imágenes temporales y reglas de precisión/histéresis. Se verificaron TypeScript y lint de los tres proyectos, pruebas unitarias, PostgreSQL/PostGIS aislado, el APK Android completo mediante `assembleDebug` y la exportación JavaScript/Hermes para iOS. El módulo Android incluye recursos y manifiesto propios.

Para verificar la migración y consultas reales en una base aislada inicializada con el snapshot y migraciones:

```sh
CONTACT_TEST_DATABASE_URL=postgres://usuario:clave@localhost:5432/rent_contact_test \
  npm --prefix backend run test:e2e -- --runInBand contact-data-postgres
```

La suite exige un nombre `rent_*test`, usa una transacción y revierte sus datos. Comprueba GIS, edición de unidad/dirección, aislamiento, CRM, teléfonos compartidos, eventos y reservas globales.

Antes de habilitar producción deben probarse Android/iOS reales: agregar/redimensionar widget, entrar/salir de geocercas, permisos revocados, aplicación cerrada, múltiples destinatarios, sesión/empresa distinta, datos vencidos y apertura manual de WhatsApp. iOS requiere build firmado con Xcode/EAS y App Group; las compilaciones y pruebas físicas iOS no se pueden ejecutar desde Linux. Las credenciales de ArcGIS deben configurarse y su cuota verificarse en la cuenta real.

Fuentes: [Nominatim](https://operations.osmfoundation.org/policies/nominatim/), [OSRM/FOSSGIS](https://routing.openstreetmap.de/about.html), [ArcGIS Static Maps](https://developers.arcgis.com/rest/static-maps/), [ArcGIS Billing](https://location.arcgis.com/help/billing/), [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), [Expo Widgets 56](https://docs.expo.dev/versions/v56.0.0/sdk/widgets/), [google-libphonenumber](https://github.com/ruimarinho/google-libphonenumber).
