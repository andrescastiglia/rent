# Plan de Trabajo - Plataforma de Administración de Alquileres

**Versión**: 1.0  
**Método de Estimación**: Story Points (SP) - 1 SP ≈ 1

---

## Resumen Ejecutivo

Este plan de trabajo detalla la implementación completa de la Plataforma de Administración de Alquileres, basándose en:
- **Documento de Requerimientos Funcionales (DRF)**
- **Documento de Arquitectura Técnica (DAT)**
- **Diagramas C4** (Contexto, Contenedores, Componentes, Código)
- **Modelo de Datos (ERD)**
- **Diagramas de Secuencia**

El proyecto se divide en **6 fases principales**.

---

## Fase 0: Preparación e Infraestructura

### Objetivo
Establecer la base técnica y organizativa del proyecto.

### Tareas

#### 0.1 Configuración del Proyecto
- **T001**: Crear repositorios Git (frontend, backend, infrastructure) **[2 SP]**
  - Estructura de mono-repo o multi-repo
  - Configuración de ramas (main, develop, feature/*)
  - Políticas de commits y PR
  
- **T002**: Configurar herramientas de gestión de proyecto **[1 SP]**
  - Jira/Linear/GitHub Projects
  - Tableros Kanban/Scrum
  - Definir workflow de tareas

- **T003**: Establecer estándares de código **[2 SP]**
  - Guías de estilo (ESLint, Prettier, etc.)
  - Convenciones de nombrado
  - Documentación de código

#### 0.2 Infraestructura Base (IaC)

- **T004**: Configurar entorno de desarrollo local **[3 SP]**
  - Docker Compose para servicios locales
  - PostgreSQL + Redis + RabbitMQ
  - Scripts de inicialización

- **T005**: Crear infraestructura cloud con Terraform **[5 SP]**
  - VPC, subnets, security groups
  - RDS PostgreSQL (staging + prod)
  - ElastiCache Redis
  - S3 buckets para documentos
  - SQS/RabbitMQ para mensajería
  
- **T006**: Configurar Kubernetes (EKS/GKE/AKS) **[5 SP]**
  - Cluster staging y production
  - Namespaces por entorno
  - Ingress controller
  - Helm charts base

#### 0.3 CI/CD Pipeline

- **T007**: Configurar GitHub Actions / GitLab CI **[4 SP]**
  - Pipeline de build
  - Tests unitarios automáticos
  - Análisis de código (SonarQube)
  - Build y push de imágenes Docker

- **T008**: Implementar CD a staging **[3 SP]**
  - Deploy automático a staging
  - Smoke tests post-deploy
  - Rollback automático en caso de fallo

#### 0.4 Observabilidad

- **T009**: Implementar stack de logging **[3 SP]**
  - Fluentd/Logstash → Elasticsearch
  - Kibana para visualización
  - Configurar índices y retención

- **T010**: Configurar métricas y monitoreo **[3 SP]**
  - Prometheus para métricas
  - Grafana dashboards
  - Alertas básicas (CPU, memoria, disco)

**Total Fase 0**: 31 SP

**Criterios de Éxito**:
- ✅ Infraestructura cloud operativa (staging)
- ✅ Pipeline CI/CD funcional
- ✅ Entorno local de desarrollo documentado
- ✅ Logs y métricas básicas funcionando

---

## Fase 1: MVP - Core Business

### Objetivo
Implementar la funcionalidad mínima viable con los módulos core del negocio.

### 1.1 Backend Core - Autenticación y Usuarios

- **T101**: Diseño e implementación del modelo de datos core **[5 SP]**
  - Migrations de PostgreSQL
  - Entidades: User, Company, Owner, Tenant, Staff, Admin
  - Índices y constraints

- **T102**: Módulo de Autenticación **[8 SP]**
  - Registro de usuarios
  - Login con email/password
  - JWT + Refresh tokens
  - Middleware de autenticación
  - Tests unitarios e integración

- **T103**: Sistema RBAC (Control de Acceso) **[5 SP]**
  - Definición de roles y permisos
  - Middleware de autorización
  - Guards por rol
  - Tests de autorización

- **T104**: API de gestión de usuarios **[3 SP]**
  - CRUD de usuarios
  - Cambio de contraseña
  - Perfil de usuario
  - Validaciones

### 1.2 Backend Core - Propiedades

- **T111**: Modelo de datos de propiedades **[4 SP]**
  - Entidades: Property, Unit, PropertyFeature
  - Relaciones con Company y Owner
  - Migrations y seeds de prueba

- **T112**: API de Propiedades **[8 SP]**
  - CRUD de propiedades
  - Gestión de unidades
  - Búsqueda y filtros
  - Paginación
  - Validaciones de negocio

- **T113**: Gestión de imágenes y documentos **[5 SP]**
  - Upload a S3 con pre-signed URLs
  - Modelo Document
  - API para subir/descargar archivos
  - Límites de tamaño y formatos

### 1.3 Backend Core - Inquilinos

- **T121**: Modelo de datos de inquilinos **[3 SP]**
  - Entidad Tenant con datos personales
  - Validaciones de DNI/ID único
  - Historial y referencias

- **T122**: API de Inquilinos **[6 SP]**
  - CRUD de inquilinos
  - Búsqueda y filtros
  - Validación de identidad única
  - Historial de pagos (vista)

### 1.4 Backend Core - Contratos (Leases)

- **T131**: Modelo de datos de contratos **[5 SP]**
  - Entidades: Lease, LeaseAmendment
  - Relaciones con Unit y Tenant
  - Estados de contrato
  - Migrations

- **T132**: API de Contratos **[10 SP]**
  - Crear contrato (draft)
  - Editar términos
  - Activar/finalizar contrato
  - Renovaciones y enmiendas
  - Validaciones (solapamiento, fechas)
  - Alertas de vencimiento

- **T133**: Generación de documentos PDF (contratos) **[6 SP]**
  - Integración con librería de PDF (PDFKit/Puppeteer)
  - Plantillas de contrato
  - Generación y almacenamiento en S3
  - API para descargar contrato

### 1.5 Frontend Base - Portal Web

- **T141**: Setup del proyecto frontend **[3 SP]**
  - Next.js + React
  - Configuración de Tailwind CSS / styled-components
  - Estructura de carpetas
  - Routing

- **T142**: Sistema de autenticación frontend **[5 SP]**
  - Páginas de login/registro
  - Manejo de tokens (localStorage/cookies)
  - Rutas protegidas
  - Refresh token automático

- **T143**: Layout y navegación principal **[4 SP]**
  - Header con menú
  - Sidebar para navegación
  - Footer
  - Responsive design

- **T144**: Módulo de Propiedades (UI) **[8 SP]**
  - Lista de propiedades
  - Detalle de propiedad
  - Formulario crear/editar
  - Upload de imágenes
  - Integración con API

- **T145**: Módulo de Inquilinos (UI) **[6 SP]**
  - Lista de inquilinos
  - Detalle de inquilino
  - Formulario crear/editar
  - Búsqueda y filtros

- **T146**: Módulo de Contratos (UI) **[8 SP]**
  - Lista de contratos
  - Detalle de contrato
  - Formulario crear/editar
  - Visualizar PDF
  - Estados y alertas

### 1.6 Base de Datos y Seeds

- **T151**: Scripts de seeds de datos de prueba **[3 SP]**
  - Usuarios de diferentes roles
  - Propiedades de ejemplo
  - Inquilinos de prueba
  - Contratos activos y vencidos

### 1.7 Testing MVP

- **T161**: Tests unitarios backend (70% coverage) **[8 SP]**
  - Tests de servicios
  - Tests de validaciones
  - Tests de autenticación/autorización

- **T162**: Tests de integración API **[5 SP]**
  - Tests end-to-end de flujos principales
  - Tests de autenticación
  - Tests de creación de contrato

- **T163**: Tests E2E frontend críticos **[5 SP]**
  - Login flow
  - Crear propiedad
  - Crear contrato
  - Cypress/Playwright

**Total Fase 1**: 120 SP

**Criterios de Éxito**:
- ✅ Usuarios pueden autenticarse
- ✅ CRUD completo de Propiedades, Inquilinos y Contratos
- ✅ Generación básica de PDF de contrato
- ✅ Portal web funcional con navegación
- ✅ Tests con >70% coverage

---

## Fase 2: Integraciones Externas

### Objetivo
Integrar servicios externos críticos para el negocio.

### 2.1 Módulo de Pagos

- **T201**: Modelo de datos de pagos **[4 SP]**
  - Entidades: Payment, Invoice
  - Estados de pago
  - Historial de transacciones
  - Migrations

- **T202**: Integración con Stripe (futuras versiones) **[8 SP]**
  - Configuración de cuenta Stripe
  - Implementar patrón Strategy para PSP
  - API de creación de checkout
  - Webhooks de confirmación
  - Manejo de errores y reintentos

- **T203**: Integración con MercadoPago **[6 SP]**
  - Implementación de Strategy para MP
  - API de preferencias
  - Webhooks de notificaciones
  - Testing en sandbox

- **T204**: API de Pagos **[7 SP]**
  - Registrar pago manual
  - Iniciar pago online
  - Consultar historial
  - Generar recibo
  - Cálculo de mora

- **T205**: Generación de facturas/recibos PDF **[5 SP]**
  - Template de factura/recibo
  - Generación automática post-pago
  - Almacenamiento en S3
  - Envío por email

### 2.2 Firma Digital

- **T211**: Integración con DocuSign **[8 SP]**
  - Configuración de cuenta
  - API de creación de sobres
  - Envío de documentos para firma
  - Webhook de firma completada
  - Descarga de documento firmado

- **T212**: Flujo de firma de contrato **[6 SP]**
  - Generar PDF de contrato
  - Enviar para firma
  - Actualizar estado cuando se firma
  - Notificaciones a las partes

### 2.3 Notificaciones

- **T221**: Servicio de notificaciones **[5 SP]**
  - Abstraer NotificationService
  - Plantillas de emails
  - Sistema de cola para notificaciones

- **T222**: Integración con SendGrid (Email) **[4 SP]**
  - Configuración de API key
  - Templates en SendGrid
  - Envío de emails transaccionales
  - Tracking de envíos

- **T223**: Integración con Twilio (SMS) **[4 SP]**
  - Configuración de cuenta
  - Envío de SMS
  - Log de mensajes enviados

- **T224**: Push Notifications setup (Firebase) **[3 SP]**
  - Configuración básica
  - Registro de dispositivos
  - Envío de notificaciones (preparación para mobile)

### 2.4 UI Módulo de Pagos

- **T231**: Módulo de Pagos (Frontend) **[8 SP]**
  - Lista de pagos por contrato
  - Registrar pago manual
  - Iniciar pago online (Stripe checkout)
  - Visualizar recibo
  - Historial de transacciones

### 2.5 Testing Integraciones

- **T241**: Tests de integración con PSPs **[4 SP]**
  - Mocks de Stripe/MercadoPago
  - Tests de webhooks
  - Tests de errores de pago

- **T242**: Tests de notificaciones **[3 SP]**
  - Mocks de SendGrid/Twilio
  - Verificar envío correcto
  - Templates rendering

**Total Fase 2**: 75 SP

**Criterios de Éxito**:
- ✅ Pagos online funcionales con Stripe
- ✅ Firma digital de contratos con DocuSign
- ✅ Notificaciones por email y SMS operativas
- ✅ Generación automática de recibos

---

## Fase 3: Funcionalidades Avanzadas

### Objetivo
Completar módulos restantes y funcionalidades avanzadas.

### 3.1 CRM y Gestión Comercial

- **T301**: Modelo de datos CRM **[4 SP]**
  - Entidades: Lead, LeadActivity
  - Estados y fuentes de leads
  - Migrations

- **T302**: API de CRM **[8 SP]**
  - CRUD de leads
  - Seguimiento de actividades
  - Cambio de estados
  - Conversión a inquilino
  - Emparejamiento automático con propiedades

- **T303**: UI de CRM **[8 SP]**
  - Dashboard de leads
  - Kanban board de estados
  - Formulario de lead
  - Vista de actividades
  - Sugerencias de propiedades

### 3.2 Mantenimiento

- **T311**: Modelo de datos de mantenimiento **[3 SP]**
  - Entidad: MaintenanceTicket
  - Prioridades y estados
  - Migrations

- **T312**: API de Mantenimiento **[7 SP]**
  - CRUD de tickets
  - Asignación a técnicos
  - Actualización de estados
  - Upload de fotos
  - Notificaciones automáticas

- **T313**: UI de Mantenimiento **[7 SP]**
  - Portal de inquilino: crear ticket
  - Portal de staff: gestionar tickets
  - Lista y filtros de tickets
  - Detalle con fotos y comentarios

### 3.3 Reportes

- **T321**: Modelo de datos de reportes **[3 SP]**
  - Entidades: ReportTemplate, ReportExecution
  - Tipos de reportes
  - Migrations

- **T322**: Motor de generación de reportes **[10 SP]**
  - Servicio de queries complejas
  - Generación de PDF (múltiples reportes)
  - Exportación a Excel
  - Worker asíncrono para reportes pesados

- **T323**: Reportes predefinidos **[8 SP]**
  - Rent Roll (ingresos por propiedad)
  - Estado de cuenta por propietario
  - Cuentas por cobrar (morosidad)
  - Flujo de caja
  - Estado de resultados

- **T324**: UI de Reportes **[6 SP]**
  - Lista de reportes disponibles
  - Parámetros y filtros
  - Previsualización
  - Descarga PDF/Excel
  - Programación de reportes automáticos

### 3.4 Portal de Propietarios

- **T331**: Portal específico para propietarios **[8 SP]**
  - Dashboard de rendimiento
  - Lista de propiedades del owner
  - Contratos activos
  - Pagos recibidos
  - Documentos y reportes

### 3.5 Portal de Inquilinos

- **T341**: Portal específico para inquilinos **[8 SP]**
  - Dashboard personal
  - Contrato vigente
  - Historial de pagos
  - Pagar renta online
  - Crear tickets de mantenimiento

### 3.6 Mobile App (PWA básica)

- **T351**: Convertir web a PWA **[5 SP]**
  - Service workers
  - Manifest.json
  - Iconos y splash screens
  - Offline básico
  - Installable

### 3.7 Auditoría

- **T361**: Sistema de auditoría **[6 SP]**
  - Modelo AuditLog
  - Interceptor para registrar cambios
  - API de consulta de audit trail
  - UI de auditoría (admin)

### 3.8 Testing Fase 3

- **T371**: Tests de CRM, Mantenimiento, Reportes **[10 SP]**
  - Tests unitarios de servicios nuevos
  - Tests de integración
  - Tests de generación de reportes

- **T372**: Tests E2E de flujos completos **[6 SP]**
  - Flujo: Lead → Inquilino → Contrato → Pago
  - Crear ticket de mantenimiento
  - Generar reporte

**Total Fase 3**: 107 SP

**Criterios de Éxito**:
- ✅ CRM funcional con gestión de leads
- ✅ Sistema de tickets de mantenimiento operativo
- ✅ Reportes predefinidos generándose correctamente
- ✅ Portales específicos para propietarios e inquilinos
- ✅ PWA instalable en móviles

---

## Fase 4: Optimización y Escalamiento

### Objetivo
Mejorar performance, escalabilidad y experiencia de usuario.

### 4.1 Performance y Caching

- **T401**: Implementar caché con Redis **[5 SP]**
  - Cache de queries frecuentes
  - Cache de sesiones
  - Cache de contadores/dashboards
  - Políticas de invalidación

- **T402**: Optimización de queries DB **[5 SP]**
  - Análisis de queries lentas
  - Índices adicionales
  - Eager loading vs Lazy loading
  - Query optimization

- **T403**: Implementar paginación eficiente **[3 SP]**
  - Cursor-based pagination
  - Infinite scroll en UI
  - Límites y ordenamiento

### 4.2 Búsqueda Avanzada

- **T411**: Integración con Elasticsearch **[8 SP]**
  - Configuración de cluster
  - Indexación de propiedades
  - Sincronización con PostgreSQL
  - API de búsqueda full-text

- **T412**: UI de búsqueda avanzada **[5 SP]**
  - Barra de búsqueda con autocompletado
  - Filtros combinados
  - Búsqueda por ubicación (mapa)
  - Resultados con highlighting

### 4.3 Workers Asíncronos

- **T421**: Implementar workers para tareas pesadas **[6 SP]**
  - Worker para cobros recurrentes
  - Worker para generación de reportes
  - Worker para envío masivo de emails
  - Configuración de colas y prioridades

- **T422**: Cobros recurrentes automáticos **[8 SP]**
  - Scheduler diario (cron)
  - Lógica de cobros automáticos
  - Reintentos en caso de fallo
  - Notificaciones de resultado
  - Dashboard de ejecuciones

### 4.4 Mejoras de UX

- **T431**: Dashboards interactivos **[8 SP]**
  - Dashboard admin con métricas clave
  - Gráficos de ocupación
  - Gráficos de ingresos
  - Alertas visuales
  - Librería de charts (Chart.js/Recharts)

- **T432**: Notificaciones en tiempo real **[5 SP]**
  - WebSockets / Server-Sent Events
  - Toast notifications en UI
  - Centro de notificaciones in-app

### 4.5 Seguridad Avanzada

- **T441**: Implementar 2FA (Autenticación de dos factores) **[5 SP]**
  - TOTP con Google Authenticator
  - Backup codes
  - UI de configuración

- **T442**: Rate limiting y throttling **[3 SP]**
  - Configurar en API Gateway
  - Por IP y por usuario
  - Respuestas 429 Too Many Requests

- **T443**: Security headers y WAF básico **[3 SP]**
  - CORS configurado correctamente
  - Security headers (CSP, HSTS, etc.)
  - Protección contra XSS, CSRF

### 4.6 Testing y Load Testing

- **T451**: Load testing con k6/Gatling **[5 SP]**
  - Escenarios de carga
  - Identificar cuellos de botella
  - Reportes de performance

- **T452**: Security testing básico **[3 SP]**
  - OWASP ZAP / Burp Suite
  - Escaneo de vulnerabilidades
  - Penetration testing básico

**Total Fase 4**: 72 SP

**Criterios de Éxito**:
- ✅ Performance mejorado (API <500ms p95)
- ✅ Búsqueda full-text funcional
- ✅ Cobros automáticos operativos
- ✅ Dashboards con métricas en tiempo real
- ✅ Tests de carga pasados exitosamente

---

## Fase 5: Preparación para Producción

### Objetivo
Endurecer el sistema para producción y establecer procesos operativos.

### 5.1 Hardening de Seguridad

- **T501**: Auditoría de seguridad completa **[5 SP]**
  - Revisar permisos y roles
  - Auditar logs sensibles
  - Verificar cifrado de datos
  - Compliance checklist

- **T502**: Gestión de secrets con Vault/AWS Secrets Manager **[4 SP]**
  - Migrar secrets a gestor
  - Rotación automática de keys
  - Configuración de accesos

- **T503**: Backups automatizados **[4 SP]**
  - Snapshots diarios de RDS
  - Retention policy (30 días)
  - Backup de S3 con versionado
  - Restore drills

### 5.2 Documentación

- **T511**: Documentación técnica completa **[8 SP]**
  - README actualizado
  - Guía de instalación local
  - Guía de despliegue
  - Arquitectura actualizada
  - Runbooks operativos

- **T512**: Documentación de API (OpenAPI/Swagger) **[4 SP]**
  - Generar documentación automática
  - Ejemplos de requests/responses
  - Postman collection actualizada

- **T513**: Manual de usuario **[6 SP]**
  - Guías por rol (admin, inquilino, propietario)
  - Capturas de pantalla
  - FAQs
  - Videos tutoriales (opcional)

### 5.3 Monitoreo y Alertas

- **T521**: Configurar alertas de producción **[4 SP]**
  - Alertas críticas (DB down, API errors >5%)
  - PagerDuty/Opsgenie integration
  - Runbooks por alerta
  - On-call rotation

- **T522**: Dashboards de producción **[4 SP]**
  - Dashboard de salud del sistema
  - Dashboard de métricas de negocio
  - Dashboard de SLIs/SLOs

### 5.4 Disaster Recovery

- **T531**: Plan de DR y tests **[5 SP]**
  - Documentar RTO/RPO
  - Procedimiento de failover
  - Test de restore de backup
  - Plan de comunicación en incidentes

### 5.5 Ambiente de Producción

- **T541**: Configurar ambiente de producción **[6 SP]**
  - Infraestructura multi-AZ
  - Auto-scaling configurado
  - CDN configurado (CloudFront)
  - DNS y certificados SSL

- **T542**: Pipeline de CD a producción **[4 SP]**
  - Deploy manual con aprobación
  - Blue-green deployment
  - Rollback strategy
  - Smoke tests post-deploy

### 5.6 UAT (User Acceptance Testing)

- **T551**: Sesiones de UAT con usuarios reales **[8 SP]**
  - Preparar ambiente de staging
  - Sesiones con usuarios piloto
  - Recolectar feedback
  - Ajustes críticos

### 5.7 Capacitación

- **T561**: Capacitación a usuarios **[5 SP]**
  - Sesiones de training por rol
  - Material de capacitación
  - Q&A sessions

**Total Fase 5**: 67 SP

**Criterios de Éxito**:
- ✅ Auditoría de seguridad aprobada
- ✅ Documentación completa
- ✅ Backups y DR probados
- ✅ Ambiente de producción listo
- ✅ UAT completado con éxito

---

## Fase 6: Go-Live y Estabilización

### Objetivo
Lanzar a producción y estabilizar el sistema.

### 6.1 Migración de Datos

- **T601**: Scripts de migración de datos existentes **[8 SP]**
  - ETL desde sistema legacy (si aplica)
  - Validación de integridad
  - Dry-run en staging
  - Ejecución en producción

### 6.2 Go-Live

- **T611**: Deployment a producción **[3 SP]**
  - Deploy en ventana de mantenimiento
  - Verificación de todos los servicios
  - Monitoring intensivo post-deploy

- **T612**: Comunicación de lanzamiento **[2 SP]**
  - Anuncio a usuarios
  - Soporte disponible 24/7
  - Canales de comunicación

### 6.3 Estabilización

- **T621**: Monitoreo y corrección de bugs críticos **[10 SP]**
  - Guardia activa primeros días
  - Hotfixes de bugs críticos
  - Ajustes de performance

- **T622**: Optimizaciones post-lanzamiento **[5 SP]**
  - Ajustar configuraciones según carga real
  - Optimizar queries problemáticas
  - Ajustar auto-scaling

### 6.4 Retrospectiva y Mejora Continua

- **T631**: Retrospectiva del proyecto **[2 SP]**
  - Reunión de equipo
  - Lecciones aprendidas
  - Documentar best practices

- **T632**: Plan de roadmap futuro **[3 SP]**
  - Priorizar features pendientes
  - Mejoras identificadas en UAT
  - Planificar próximas iteraciones

**Total Fase 6**: 33 SP

**Criterios de Éxito**:
- ✅ Sistema en producción y estable
- ✅ Usuarios migrando al nuevo sistema
- ✅ SLA de 99.9% cumplido
- ✅ Bugs críticos resueltos <24h

---

## Features Futuras (Post-MVP)

Funcionalidades a considerar para iteraciones posteriores:

### Fase 7: Innovación (Futuro)

- **IA para fijación de precios**: Machine learning para sugerir rentas óptimas basadas en mercado
- **Integración con IoT**: Sensores inteligentes para mantenimiento preventivo
- **Integración con portales inmobiliarios**: Publicación automática en Airbnb, Zillow, Idealista
- **Chatbot de atención**: Bot para responder FAQs de inquilinos
- **App móvil nativa**: React Native o Flutter para app dedicada
- **Renovaciones automáticas inteligentes**: Sistema que propone renovaciones basado en historial
- **Integración con sistemas contables**: Export automático a QuickBooks, Xero, etc.
- **Módulo de facturación fiscal**: Integración con AFIP u otros sistemas fiscales
- **Dashboard de BI avanzado**: Análisis predictivo y tendencias de mercado

---

## Resumen de Estimaciones

| Fase | Descripción | Story Points |
|------|-------------|--------------|
| **Fase 0** | Preparación e Infraestructura | 31 SP |
| **Fase 1** | MVP Core Business | 120 SP |
| **Fase 2** | Integraciones Externas | 75 SP |
| **Fase 3** | Funcionalidades Avanzadas | 107 SP |
| **Fase 4** | Optimización y Escalamiento | 72 SP |
| **Fase 5** | Preparación para Producción | 67 SP |
| **Fase 6** | Go-Live y Estabilización | 33 SP |
| **TOTAL** | | **505 SP** |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Complejidad de integraciones externas | Alta | Alto | Usar sandboxes, empezar temprano, tener fallbacks |
| Cambios en requerimientos | Media | Alto | Metodología ágil, sprints cortos, feedback continuo |
| Problemas de performance en producción | Media | Alto | Load testing en fase 4, monitoreo desde día 0 |
| Fuga de datos / seguridad | Baja | Crítico | Auditorías, pentesting, seguir best practices |
| Migración de datos compleja | Media | Alto | Scripts bien probados, dry-runs, backups |
| Dependencia de proveedores externos | Media | Medio | Contratos SLA, diseño de fallbacks, multi-provider |

---

## Hitos Clave (Milestones)

1. **M1**: Infraestructura base operativa *(Fin de Fase 0)*
2. **M2**: MVP funcional - Demo interno *(Fin de Fase 1)*
3. **M3**: Integraciones externas funcionando *(Fin de Fase 2)*
4. **M4**: Funcionalidades completas - Beta cerrada *(Fin de Fase 3)*
5. **M5**: Sistema optimizado - Beta pública *(Fin de Fase 4)*
6. **M6**: UAT aprobado - Pre-producción *(Fin de Fase 5)*
7. **M7**: Go-Live - Producción *(Inicio de Fase 6)*
8. **M8**: Sistema estable - Operación normal *(Fin de Fase 6)*

---

## Notas Finales

Este plan es una guía inicial y debe ajustarse según:
- Feedback de usuarios en UAT
- Cambios en prioridades de negocio
- Lecciones aprendidas en cada fase
- Recursos disponibles

Se recomienda revisión y ajuste del plan periódicamente en sesiones de planning.

---

**Versión**: 1.0  
**Próxima Revisión**: Inicio de cada Fase
