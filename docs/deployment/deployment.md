# Despliegue productivo por artefacto inmutable

**Estado:** operativo

**Última actualización:** 2026-09-03

**Autoridad:** `.github/workflows/release.yml`, `.github/workflows/eas.yml` y `ansible/deploy.yml`

Rent se publica desde un tag SemVer anotado que apunta exactamente al `HEAD` de
`main`. GitHub Actions compila una vez, genera SBOM y checksums, despliega ese
mismo artefacto y lo adjunta a la GitHub Release. El servidor nunca clona ni
compila el repositorio.

## Condiciones de entrada

Antes de crear el tag deben cumplirse todas estas condiciones:

- `main` está sincronizada y es la única rama remota.
- No hay pull requests abiertos.
- CI está verde en el SHA que se va a etiquetar.
- El tag anotado cumple `vMAJOR.MINOR.PATCH`.
- El secreto protegido `PRODUCTION_ENV_FILE` contiene el runtime completo.
- La migración legada de imágenes fue ejecutada y verificada cuando aplique.

El job `preflight` vuelve a comprobar tag, SHA, ramas y PR antes de construir,
y exige un run exitoso de `CI Pipeline` disparado por `push` a `main` para el
SHA exacto. El release reutiliza esa evidencia y no repite la matriz ni ejecuta
Sonar sobre una referencia de tag. No se debe relajar esa comprobación para
destrabar un release.

## Estructura del servidor

```text
/var/www/rent/
├── current -> releases/server-<sha>
├── releases/
│   └── server-<sha>/
└── shared/
    └── .env
```

El usuario SSH de CI debe poder ejecutar `sudo` sin interacción. Ansible usa
esa conexión para ejecutar las tareas remotas como el usuario de servicio
`deploy`, que debe poder escribir en `/var/www/rent` y `/var/log/rent`, ejecutar
`pm2`, y conectarse a PostgreSQL con las credenciales del archivo compartido.
Se requieren Node.js según `.node-version`, PM2, `sha256sum`, `tar` y el cliente
PostgreSQL. Git y npm no son necesarios para el despliegue.

## Secretos y variables de GitHub

Configurar el environment protegido `production-release` con aprobación manual
y estos secretos:

- `SSH_PRIVATE_KEY`: clave dedicada, sin passphrase, de alcance mínimo.
- `SSH_KNOWN_HOSTS`: salida validada de `ssh-keyscan`, no generada durante CI.
- `SSH_HOST`, `SSH_USER` y `SSH_PORT`.
- `PRODUCTION_ENV_FILE`: contenido completo del `.env` productivo, inicializado desde `oracle` y actualizado únicamente como secreto protegido.
- `EXPO_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` y credenciales Android.

Configurar `NEXT_PUBLIC_TURNSTILE_SITE_KEY` como variable del repositorio o del
environment. GitHub Actions materializa temporalmente `PRODUCTION_ENV_FILE`,
Ansible actualiza `/var/www/rent/shared/.env` con modo `0600` y el runner se
descarta. El secreto nunca se incluye en el artefacto ni en los logs.

Variables mínimas de runtime:

```dotenv
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
FRONTEND_URL=https://rent.maese.com.ar
DOCUSIGN_WEBHOOK_SECRET=...
WHATSAPP_APP_SECRET=...
```

## TLS y rutas

Nginx o el proxy administrado termina TLS y solo expone HTTPS. Usar TLS 1.2 o
superior, redirigir HTTP a HTTPS y no cachear `/api/`.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Los puertos 3000, 3001, PostgreSQL y métricas no deben ser públicos. Validar
`nginx -t`, la cadena completa del certificado y el endpoint externo `/health`
antes del primer tag.

## Migración previa de imágenes legadas

Primero ejecutar en modo lectura con el directorio real que contiene el
contenido histórico de `uploads/properties`:

```bash
node scripts/migrate-legacy-property-images.cjs \
  --uploads-root=/ruta/validada/uploads/properties
```

El comando carga todos los archivos, valida que no escapen del directorio,
comprueba el tipo por magic bytes y calcula SHA-256. Revisar los conteos; luego
repetir con `--apply`. La escritura ocurre en una transacción y termina solo si
ya no quedan referencias `/uploads/properties/`. Conservar salida, conteos y
backup como evidencia del tag.

## Crear el release

Desde una copia limpia y sincronizada:

```bash
git switch main
git pull --ff-only origin main
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

El workflow realiza:

1. validación del run exitoso de CI de `main` para el SHA exacto;
2. build único de backend, batch y Next standalone;
3. SBOM CycloneDX de backend, batch, frontend y mobile;
4. empaquetado y checksum `rent-server-<sha>.tar.gz`;
5. build EAS, descarga y checksum del AAB exacto;
6. migraciones forward-compatible antes del cambio de enlace;
7. cambio atómico de `current` y `pm2 startOrReload`;
8. verificaciones de disponibilidad de backend y frontend mediante `/health`;
9. publicación de ambos artefactos y SBOM en la GitHub Release.

El artefacto del servidor y Android se construyen en paralelo, pero el servidor
solo se despliega después de que Android haya sido construido, enviado y
publicado correctamente. Si Android falla, las migraciones y el cambio de
versión del servidor no comienzan.

## Migraciones expand/contract

Un release solo puede contener cambios compatibles con la versión anterior:

1. **expand:** agregar tablas/columnas/índices y código compatible;
2. migrar o rellenar datos de forma reanudable;
3. cambiar lectores y escritores en un release posterior;
4. **contract:** eliminar lo antiguo únicamente cuando no haya procesos que lo
   usen y el rollback ya no dependa de ello.

El rollback de aplicación no revierte SQL. Cada migración debe ser idempotente
cuando sea posible y estar envuelta en transacción. No se publican cambios
destructivos en esta etapa; disaster recovery y los ensayos de restore quedan
diferidos explícitamente.

## Verificación y rollback

Durante el despliegue, Ansible verifica `SHA256SUMS` y que `RELEASE_SHA`
coincida con el SHA solicitado. Si falla una verificación de disponibilidad restaura el enlace previo
y recarga PM2 automáticamente.

Verificación posterior de despliegue (no es una prueba funcional):

```bash
readlink -f /var/www/rent/current
cat /var/www/rent/current/RELEASE_SHA
pm2 status
curl --fail http://127.0.0.1:3001/health
curl --fail http://127.0.0.1:3000/health
sha256sum --check /var/www/rent/current/SHA256SUMS
```

Para un rollback manual de emergencia, seleccionar un directorio existente y
verificado, cambiar primero un enlace temporal y luego reemplazarlo de forma
atómica:

```bash
ln -s /var/www/rent/releases/server-<sha-anterior> /var/www/rent/current.next
mv -Tf /var/www/rent/current.next /var/www/rent/current
cd /var/www/rent/current
RENT_CURRENT_PATH=/var/www/rent/current \
RENT_SHARED_ENV=/var/www/rent/shared/.env \
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
```

Después, repetir healthchecks y documentar SHA, motivo, hora, operador y estado
de base de datos. Las migraciones de esta etapa son aditivas y no se revierte
SQL automáticamente.
