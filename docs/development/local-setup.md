# Guía de Configuración del Entorno de Desarrollo Local

## 📋 Tabla de Contenidos

- [Requisitos Previos](#requisitos-previos)
- [Instalación Rápida](#instalación-rápida)
- [Servicios Disponibles](#servicios-disponibles)
- [Comandos Útiles](#comandos-útiles)
- [Conexión a Servicios](#conexión-a-servicios)
- [CAPTCHA (Turnstile)](#captcha-turnstile)
- [Estructura de Archivos](#estructura-de-archivos)
- [Troubleshooting](#troubleshooting)
- [FAQs](#faqs)

---

## Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:

### Obligatorios
- **Docker** (versión 20.10+)
  - [Descargar Docker Desktop](https://www.docker.com/products/docker-desktop)
- **Docker Compose** (versión 2.0+)
  - Incluido en Docker Desktop
- **Make** (para comandos de utilidad)
  - Linux/macOS: Generalmente pre-instalado
  - Windows: Instalar [Make para Windows](http://gnuwin32.sourceforge.net/packages/make.htm) o usar WSL

### Opcionales (recomendados)
- **psql** (cliente PostgreSQL) - Para interacción directa con la BD
- **redis-cli** (cliente Redis) - Para debugging de caché
- **Git** - Para control de versiones

### Verificar Instalación

```bash
# Verificar Docker
docker --version
docker-compose --version

# Verificar Make
make --version

# Verificar que Docker está corriendo
docker ps
```

---

## Instalación Rápida

### Paso 1: Clonar el Repositorio

```bash
git clone <url-del-repositorio>
cd rent
```

### Paso 2: Setup Inicial

El comando `make setup` configurará todo automáticamente:

```bash
make setup
```

Este comando:
1. ✅ Crea el archivo `.env` desde `.env.example`
2. ✅ Inicia todos los servicios Docker
3. ✅ Espera a que los servicios estén listos
4. ✅ Ejecuta healthcheck para verificar conexiones

### Paso 3: Verificar Instalación

```bash
make healthcheck
```

Deberías ver todos los servicios marcados como operativos ✓

---

## Servicios Disponibles

### PostgreSQL 16
- **Descripción**: Base de datos relacional principal
- **Puerto**: `5432`
- **Base de datos**: `rent_dev`
- **Usuario**: `rent_user`
- **Password**: `rent_dev_password`
- **Extensiones instaladas**:
  - `uuid-ossp` - Generación de UUIDs
  - `pgcrypto` - Funciones criptográficas
  - `unaccent` - Búsqueda sin acentos
  - `postgis` - Geolocalización (opcional)

### Redis 7
- **Descripción**: Caché en memoria y almacenamiento de sesiones
- **Puerto**: `6379`
- **Password**: `rent_redis_password`
- **Persistencia**: Habilitada (AOF)

### RabbitMQ 3
- **Descripción**: Message broker para procesamiento asíncrono
- **Puerto AMQP**: `5672`
- **Puerto Management UI**: `15672`
- **Usuario**: `rent_user`
- **Password**: `rent_rabbitmq_password`
- **VHost**: `rent_vhost`

### pgAdmin 4 (Opcional)
- **Descripción**: Herramienta visual para administración de PostgreSQL
- **Puerto**: `5050`
- **Email**: `admin@rent.local`
- **Password**: `admin`
- **Nota**: Usar `make tools` para iniciarlo

---

## Comandos Útiles

### Gestión de Servicios

```bash
# Ver todos los comandos disponibles
make help

# Iniciar todos los servicios
make up

# Detener todos los servicios
make down

# Reiniciar servicios
make restart

# Ver estado de contenedores
make ps

# Ver logs de todos los servicios
make logs

# Seguir logs en tiempo real
make logs-follow
```

### Herramientas Opcionales

```bash
# Iniciar pgAdmin
make tools

# Detener herramientas
make stop-tools

# Abrir RabbitMQ Management UI
make rabbitmq-ui
```

### Base de Datos

```bash
# Abrir shell de PostgreSQL
make db-shell

# Resetear base de datos (elimina todos los datos)
make db-reset

# Resetear sin confirmación (usar con precaución)
make db-reset-force

# Crear backup
make db-backup

# Restaurar backup
make db-restore FILE=backups/backup_20231130_120000.sql
```

### Redis

```bash
# Abrir shell de Redis
make redis-shell

# Limpiar todas las claves
make redis-flush
```

### Monitoreo

```bash
# Verificar salud de servicios
make healthcheck

# Ver información de conexión
make info
```

### Limpieza

```bash
# Limpiar contenedores
make clean

# Limpiar volúmenes (ELIMINA DATOS)
make clean-volumes

# Limpieza completa
make clean-all
```

---

## Conexión a Servicios

### Desde tu Aplicación

#### PostgreSQL

**Node.js / TypeScript (con pg)**
```javascript
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'rent_dev',
  user: 'rent_user',
  password: 'rent_dev_password',
});
```

**Prisma**
```prisma
// En schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

```bash
# En .env
DATABASE_URL="postgresql://rent_user:rent_dev_password@localhost:5432/rent_dev"
```

**TypeORM**
```typescript
import { DataSource } from 'typeorm';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'rent_user',
  password: 'rent_dev_password',
  database: 'rent_dev',
});
```

#### Redis

**Node.js (con ioredis)**
```javascript
import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  password: 'rent_redis_password',
});
```

#### RabbitMQ

**Node.js (con amqplib)**
```javascript
import amqp from 'amqplib';

const connection = await amqp.connect(
  'amqp://rent_user:rent_rabbitmq_password@localhost:5672/rent_vhost'
);
```

### Desde Cliente CLI

**PostgreSQL**
```bash
psql -h localhost -p 5432 -U rent_user -d rent_dev
# Password: rent_dev_password
```

**Redis**
```bash
redis-cli -h localhost -p 6379 -a rent_redis_password
```

### Desde Cliente GUI

**PostgreSQL con pgAdmin**
1. Iniciar pgAdmin: `make tools`
2. Abrir http://localhost:5050
3. Login: `admin@rent.local` / `admin`
4. Add Server:
   - Name: `Rent Dev`
   - Host: `postgres` (nombre del servicio Docker)
   - Port: `5432`
   - Username: `rent_user`
   - Password: `rent_dev_password`

**RabbitMQ Management UI**
1. Abrir http://localhost:15672
2. Login: `rent_user` / `rent_rabbitmq_password`

---

## CAPTCHA (Turnstile)

Para habilitar CAPTCHA en autenticación:
- `register`: siempre requiere CAPTCHA.
- `login`: requiere CAPTCHA desde el segundo intento fallido.

### 1. Crear credenciales en Cloudflare

1. Entrar a Cloudflare Dashboard.
2. Ir a `Turnstile` -> `Add site`.
3. Configurar el dominio:
   - Desarrollo local: `localhost`
   - Staging/Producción: agregar tus dominios reales.
4. Guardar y copiar:
   - `Site Key`
   - `Secret Key`

### 2. Configurar variables en `.env`

Editar `rent/.env`:

```bash
# Backend (validación server-side)
TURNSTILE_SECRET_KEY=tu_secret_key_de_turnstile

# Frontend (render del widget en el navegador)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=tu_site_key_de_turnstile
```

Notas:
- `TURNSTILE_SECRET_KEY` nunca debe exponerse en frontend.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` es pública por diseño (prefijo `NEXT_PUBLIC_`).

### 3. Reiniciar servicios/aplicaciones

Si cambiaste variables de entorno:

```bash
# Si corrés con Docker/Make
make down
make up

# Si corrés frontend/backend por separado, reiniciá ambos procesos
```

### 4. Verificación rápida

1. Ir a `/{locale}/register` y confirmar que aparece CAPTCHA.
2. En `/{locale}/login`, fallar una vez las credenciales.
3. Reintentar login y verificar que ahora exige CAPTCHA.

---

## Estructura de Archivos

```
rent/
├── docker-compose.yml          # Definición de servicios Docker
├── .env.example                # Template de variables de entorno
├── .env                        # Variables de entorno (no commiteado)
├── Makefile                    # Comandos de utilidad
├── scripts/
│   ├── init-db.sql            # Inicialización de PostgreSQL
│   ├── healthcheck.sh         # Verificación de servicios
│   └── reset-db.sh            # Script de reset de BD
└── docs/
    └── development/
        └── local-setup.md     # Esta guía
```

---

## Troubleshooting

### Los contenedores no inician

**Problema**: Error al ejecutar `make up`

**Soluciones**:
```bash
# Verificar que Docker está corriendo
docker ps

# Ver logs de error
make logs

# Limpiar y volver a intentar
make clean
make up
```

### No puedo conectarme a PostgreSQL

**Problema**: Connection refused en puerto 5432

**Soluciones**:
1. Verificar que el contenedor está corriendo:
   ```bash
   make ps
   ```

2. Verificar healthcheck:
   ```bash
   make healthcheck
   ```

3. Ver logs de PostgreSQL:
   ```bash
   make logs-postgres
   ```

4. Verificar que el puerto no está en uso por otro servicio:
   ```bash
   # Linux/macOS
   lsof -i :5432
   
   # Windows
   netstat -ano | findstr :5432
   ```

### Redis no responde

**Problema**: Error al conectar con Redis

**Soluciones**:
```bash
# Verificar logs
make logs-redis

# Reiniciar Redis
docker-compose restart redis

# Verificar conexión
make redis-shell
```

### Problemas de permisos en scripts

**Problema**: Permission denied al ejecutar scripts

**Solución**:
```bash
# Dar permisos de ejecución
chmod +x scripts/*.sh

# O ejecutar directamente con bash
bash scripts/healthcheck.sh
```

### Volúmenes con datos corruptos

**Problema**: La base de datos no arranca después de un cierre abrupto

**Solución**:
```bash
# ADVERTENCIA: Esto eliminará todos los datos
make clean-volumes
make up
make db-reset
```

### Puertos ya en uso

**Problema**: Port already in use

**Solución**:
1. Cambiar los puertos en `.env`:
   ```bash
   POSTGRES_PORT=5433
   REDIS_PORT=6380
   RABBITMQ_PORT=5673
   ```

2. Reiniciar servicios:
   ```bash
   make down
   make up
   ```

---

## FAQs

### ¿Cómo cambio las credenciales?

1. Edita el archivo `.env`
2. Ejecuta `make down && make clean-volumes`
3. Ejecuta `make up`

### ¿Los datos persisten entre reinicios?

Sí, los datos se almacenan en volúmenes Docker nombrados que persisten incluso después de `make down`. Solo se eliminan con `make clean-volumes`.

### ¿Cómo actualizo a nuevas versiones de servicios?

```bash
# Detener servicios
make down

# Actualizar imágenes
docker-compose pull

# Iniciar con nuevas versiones
make up
```

### ¿Puedo usar esto en producción?

**NO**. Esta configuración es SOLO para desarrollo local. Para producción:
- Usa servicios administrados (RDS, ElastiCache, etc.)
- Configura backups automatizados
- Usa credenciales seguras
- Implementa alta disponibilidad
- Configura monitoreo y alertas

### ¿Cómo creo datos de prueba?

1. Crea un archivo `scripts/seeds.sql` con tus datos
2. Ejecuta `make db-reset` (ejecutará automáticamente los seeds)

### ¿Necesito tener pgAdmin corriendo siempre?

No, pgAdmin es opcional. Solo inícialo cuando lo necesites con `make tools`.

---

## Próximos Pasos

Después de configurar el entorno local:

1. **Backend**: Configura tu aplicación backend para conectarse a estos servicios
2. **Migraciones**: Ejecuta las migraciones de tu ORM
3. **Seeds**: Carga datos de prueba
4. **Tests**: Configura tests de integración

---

## Soporte

Para problemas o preguntas:
1. Revisa esta documentación
2. Ejecuta `make healthcheck` para diagnosticar
3. Revisa los logs con `make logs`
4. Consulta al equipo de desarrollo

---

**Última actualización**: 2025-11-30
