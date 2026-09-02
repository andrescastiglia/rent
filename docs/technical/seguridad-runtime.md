# Seguridad de runtime HTTP

## Arranque fail-closed

Todo entorno distinto de `test` debe declarar `FRONTEND_URL` y los secretos de
JWT, métricas, imágenes temporales, CAPTCHA, jobs internos y S3. WhatsApp,
MercadoPago y el webhook de email agregan sus secretos cuando la integración
correspondiente está habilitada/configurada. Producción rechaza valores de
ejemplo conocidos antes de abrir el puerto.

`FRONTEND_URL` es una lista de orígenes exactos, sin path, query ni credenciales.
En producción todos deben usar HTTPS; sólo desarrollo admite automáticamente
otros puertos de localhost. `TRUST_PROXY_HOPS` es obligatorio en producción y
acepta de 0 a 10 saltos. Express calcula `request.ip` con esa política: ningún
control de seguridad lee `x-forwarded-for` directamente.

## Rate limit distribuido

`DistributedRateLimitGuard` limita las rutas públicas con contadores atómicos en
PostgreSQL, compartidos por todas las réplicas. La clave es un SHA-256 de ruta e
IP y no persiste la dirección en claro.

- Login: 10 solicitudes/minuto/IP.
- Registro: 5 solicitudes/minuto/IP.
- Webhook MercadoPago: 120 solicitudes/minuto/IP.
- Webhook WhatsApp: 300 solicitudes/minuto/IP; verificación: 60/minuto/IP.
- Vistas de imágenes: 300 solicitudes/minuto/IP.
- Otras rutas públicas: 120 solicitudes/minuto/IP.

Health y métricas no usan este contador para conservar diagnóstico durante una
falla de base; métricas mantiene su token dedicado. Si el store compartido no
devuelve un contador válido, la ruta limitada falla cerrada. Una respuesta 429
incluye `Retry-After`.

La tabla se crea con `migrations/102_add_distributed_rate_limits.sql`. Es aditiva:
un rollback al artefacto anterior puede conservarla. Para revisar abuso o ajustar
umbrales:

```sql
SELECT request_count, expires_at
FROM api_rate_limit_buckets
ORDER BY request_count DESC
LIMIT 50;
```

Después del despliegue, verificar CORS desde un origen permitido y otro denegado,
confirmar `request.ip` detrás del proxy real, ejecutar once logins inválidos desde
una IP controlada y comprobar 429 más `Retry-After`. No habilitar un bypass de
CAPTCHA en producción; el código lo ignora aunque la variable esté presente.
