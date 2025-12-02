# Guía de Deployment - Rent Management System

**Versión**: 1.0  
**Última Actualización**: Diciembre 2025

---

## Índice

1. [Arquitectura de Deployment](#1-arquitectura-de-deployment)
2. [Requisitos del Servidor](#2-requisitos-del-servidor)
3. [Preparación del Servidor](#3-preparación-del-servidor)
4. [Configuración de Cloudflare](#4-configuración-de-cloudflare)
5. [Configuración de GitHub Secrets](#5-configuración-de-github-secrets)
6. [Proceso de Deployment](#6-proceso-de-deployment)
7. [Comandos Útiles](#7-comandos-útiles)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Arquitectura de Deployment

```mermaid
flowchart TB
    subgraph CLOUDFLARE["☁️ CLOUDFLARE"]
        CF[DNS + SSL + CDN + WAF]
    end

    subgraph VPS["🖥️ VPS SERVER"]
        subgraph NGINX_BLOCK["NGINX - Reverse Proxy"]
            NGINX[":80 / :443"]
        end
        
        subgraph APPS["Applications"]
            FRONTEND["🌐 FRONTEND<br/>Next.js + PM2<br/>:3000"]
            BACKEND["⚙️ BACKEND<br/>NestJS + PM2<br/>:3001"]
        end
        
        subgraph DATA["Data Layer"]
            POSTGRES[("🐘 PostgreSQL<br/>:5432")]
            REDIS[("🔴 Redis<br/>:6379")]
        end
    end

    CF -->|HTTPS 443| NGINX
    NGINX -->|proxy_pass| FRONTEND
    NGINX -->|/api/*| BACKEND
    BACKEND --> POSTGRES
    BACKEND --> REDIS
```

---

## 2. Requisitos del Servidor

### Hardware Mínimo (Staging)
- **CPU**: 2 vCPUs
- **RAM**: 4 GB
- **Disco**: 40 GB SSD
- **SO**: Ubuntu 22.04 LTS

### Hardware Recomendado (Production)
- **CPU**: 4 vCPUs
- **RAM**: 8 GB
- **Disco**: 80 GB SSD
- **SO**: Ubuntu 22.04 LTS

### Software Requerido

| Software   | Versión  | Propósito        |
|------------|----------|------------------|
| Node.js    | 20.x LTS | Runtime          |
| PM2        | Latest   | Process Manager  |
| Nginx      | Latest   | Reverse Proxy    |
| PostgreSQL | 16.x     | Base de datos    |
| Redis      | 7.x      | Cache y sesiones |
| Git        | Latest   | Deployments      |

---

## 3. Preparación del Servidor

### 3.1 Acceso Inicial

```bash
# Conectar al servidor
ssh root@YOUR_SERVER_IP

# Crear usuario de deploy (no usar root)
adduser deploy
usermod -aG sudo deploy

# Configurar SSH key para el usuario deploy
su - deploy
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "TU_CLAVE_PUBLICA_SSH" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 3.2 Instalación de Dependencias Base

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependencias básicas
sudo apt install -y curl wget git build-essential

# Instalar Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalación
node --version  # v20.x.x
npm --version   # 10.x.x

# Instalar PM2 globalmente
sudo npm install -g pm2

# Configurar PM2 para iniciar con el sistema
pm2 startup systemd -u deploy --hp /home/deploy
```

### 3.3 Instalación de PostgreSQL

```bash
# Instalar PostgreSQL 16
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-16

# Iniciar y habilitar servicio
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Crear base de datos y usuario
sudo -u postgres psql << EOF
CREATE USER rent_user WITH PASSWORD 'CHANGE_THIS_PASSWORD';
CREATE DATABASE rent_db OWNER rent_user;
GRANT ALL PRIVILEGES ON DATABASE rent_db TO rent_user;
EOF
```

### 3.4 Instalación de Redis

```bash
# Instalar Redis
sudo apt install -y redis-server

# Configurar Redis
sudo sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
sudo sed -i 's/# requirepass foobared/requirepass CHANGE_THIS_PASSWORD/' /etc/redis/redis.conf

# Reiniciar Redis
sudo systemctl restart redis
sudo systemctl enable redis

# Verificar
redis-cli -a CHANGE_THIS_PASSWORD ping  # PONG
```

### 3.5 Instalación y Configuración de Nginx

```bash
# Instalar Nginx
sudo apt install -y nginx
```

Crear `/etc/nginx/sites-available/rent`:

```nginx
upstream frontend {
    server 127.0.0.1:3000;
    keepalive 64;
}

upstream backend {
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name YOUR_DOMAIN.com www.YOUR_DOMAIN.com;

    # Cloudflare Real IP
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 131.0.72.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    real_ip_header CF-Connecting-IP;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # API Backend
    location /api {
        rewrite ^/api/(.*)$ /$1 break;
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /_next/static {
        proxy_pass http://frontend;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

```bash
# Habilitar sitio
sudo ln -sf /etc/nginx/sites-available/rent /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

### 3.6 Crear Estructura de Directorios

```bash
sudo mkdir -p /var/www/rent/{backend,frontend,shared}
sudo chown -R deploy:deploy /var/www/rent

# Crear archivo .env
cat > /var/www/rent/shared/.env << 'EOF'
DATABASE_URL=postgresql://rent_user:CHANGE_PASSWORD@localhost:5432/rent_db
REDIS_URL=redis://:CHANGE_PASSWORD@localhost:6379
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://YOUR_DOMAIN.com
EOF
chmod 600 /var/www/rent/shared/.env
```

### 3.7 Configurar Firewall

```bash
# Configurar UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 4. Configuración de Cloudflare

### DNS Records

| Tipo | Nombre | Contenido       | Proxy      |
|------|--------|-----------------|------------|
| A    | @      | YOUR_SERVER_IP  | ✅ Proxied |
| A    | www    | YOUR_SERVER_IP  | ✅ Proxied |

### SSL/TLS

1. Ir a **SSL/TLS** → **Overview**
2. Seleccionar modo: **Full (strict)**
3. En **Edge Certificates**:
   - Always Use HTTPS: ✅ On
   - Automatic HTTPS Rewrites: ✅ On
   - Minimum TLS Version: TLS 1.2

### Seguridad

1. **Security** → **Settings**:
   - Security Level: Medium
   - Browser Integrity Check: ✅ On

2. **Caching** → **Configuration**:
   - Page Rule para API: `*YOUR_DOMAIN.com/api/*` → Cache Level: Bypass

---

## 5. Configuración de GitHub Secrets

Ir a **Settings** → **Secrets and variables** → **Actions**.

| Secret            | Descripción                    | Ejemplo               |
|-------------------|--------------------------------|-----------------------|
| `SSH_PRIVATE_KEY` | Clave privada SSH para deploy  | `-----BEGIN...`       |
| `SSH_HOST`        | IP o dominio del servidor      | `123.45.67.89`        |
| `SSH_USER`        | Usuario de deploy              | `deploy`              |
| `SSH_PORT`        | Puerto SSH                     | `22`                  |

### Generar SSH Key para deploy

```bash
# En tu máquina local
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy

# Copiar la clave pública al servidor
ssh-copy-id -i ~/.ssh/github_deploy.pub deploy@YOUR_SERVER_IP

# El contenido de ~/.ssh/github_deploy (clave privada) va en SSH_PRIVATE_KEY
cat ~/.ssh/github_deploy
```

---

## 6. Proceso de Deployment

### Flujo de CI/CD

```mermaid
flowchart LR
    A[📤 Push] --> B[🔍 Lint]
    B --> C[🧪 Test]
    C --> D[🔨 Build]
    D --> E[🎭 E2E Tests]
    E --> F{Branch?}
    F -->|develop| G[🚀 Deploy Staging]
    F -->|main| H[🚀 Deploy Production]
```

### Triggers de Deployment

| Branch    | Entorno    | Automático                        |
|-----------|------------|-----------------------------------|
| `develop` | Staging    | ✅ Sí                             |
| `main`    | Production | ⚠️ Requiere aprobación en GitHub |

---

## 7. Comandos Útiles

### PM2

```bash
pm2 status              # Ver estado de aplicaciones
pm2 logs                # Ver logs
pm2 logs backend        # Logs solo del backend
pm2 reload all          # Reload sin downtime
pm2 monit               # Monitoreo en tiempo real
pm2 save                # Guardar configuración actual
```

### Nginx

```bash
sudo nginx -t                              # Verificar configuración
sudo systemctl restart nginx               # Reiniciar
sudo tail -f /var/log/nginx/error.log      # Ver logs de error
```

### PostgreSQL

```bash
psql -h localhost -U rent_user -d rent_db                    # Conectar
pg_dump -h localhost -U rent_user rent_db > backup.sql       # Backup
psql -h localhost -U rent_user -d rent_db < backup.sql       # Restore
```

### Redis

```bash
redis-cli -a YOUR_PASSWORD ping       # Test conexión
redis-cli -a YOUR_PASSWORD INFO       # Estadísticas
redis-cli -a YOUR_PASSWORD FLUSHALL   # Limpiar caché
```

---

## 8. Troubleshooting

### Error 502 Bad Gateway

```bash
# Verificar que las apps están corriendo
pm2 status

# Verificar configuración de Nginx
sudo nginx -t

# Ver logs de Nginx
sudo tail -f /var/log/nginx/error.log
```

### La aplicación no inicia

```bash
# Ver logs de PM2
pm2 logs --lines 100

# Verificar puertos
sudo lsof -i :3000
sudo lsof -i :3001

# Verificar variables de entorno
cat /var/www/rent/shared/.env
```

### No se puede conectar a PostgreSQL

```bash
# Verificar estado
sudo systemctl status postgresql

# Test de conexión
psql -h localhost -U rent_user -d rent_db -c "SELECT 1"
```

### Redis no responde

```bash
# Verificar estado
sudo systemctl status redis

# Test conexión
redis-cli -a YOUR_PASSWORD ping

# Reiniciar
sudo systemctl restart redis
```

---

## Checklist de Deploy

- [ ] Servidor provisionado con Ubuntu 22.04
- [ ] Usuario `deploy` creado con acceso SSH
- [ ] Node.js 20.x instalado
- [ ] PM2 instalado y configurado
- [ ] PostgreSQL instalado y base de datos creada
- [ ] Redis instalado y configurado
- [ ] Nginx instalado y configurado
- [ ] Firewall configurado (UFW)
- [ ] Cloudflare configurado (DNS + SSL)
- [ ] GitHub Secrets configurados
- [ ] Variables de entorno en `/var/www/rent/shared/.env`
- [ ] Primer deploy exitoso
- [ ] Aplicación accesible vía HTTPS

---

**Contacto**: acastiglia@gmail.com  
**Repositorio**: https://github.com/andrescastiglia/rent
