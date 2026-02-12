# Documento de Arquitectura Técnica (DAT)

**Plataforma**: Sistema de Administración de Alquileres
**Alcance**: Implementación técnica para una administradora mediana que gestiona propiedades residenciales, vacacionales y comerciales.
**Versión**: 1.0 — 2025-11-29

---

## 1. Resumen ejecutivo

Este documento describe la arquitectura técnica propuesta para la plataforma de administración de alquileres. Cubre la arquitectura lógica y física, componentes principales, modelo de datos a alto nivel, comunicación entre servicios, requisitos no funcionales (seguridad, escalabilidad, disponibilidad), estrategia de despliegue, integración con terceros y prácticas operativas (monitoring, CI/CD, backup). El objetivo es proporcionar una guía práctica y accionable para el equipo de desarrollo y operaciones.

---

## 2. Requisitos arquitectónicos clave (relevantes)

* Soportar simultáneamente usuarios administrativos, propietarios, inquilinos y técnicos de mantenimiento.
* Escalabilidad horizontal para atender crecimiento de la cartera (de docenas a miles de unidades).
* Alta disponibilidad: SLA objetivo 99.9% (api + portal).
* Seguridad de datos (cifrado en tránsito y reposo, RBAC, logs de auditoría).
* Latencia: < 200–500 ms en endpoints críticos (consulta de contrato, creación de pago).
* Resiliencia: tolerancia a fallos y recuperación ante desastre (RTO < 2h, RPO < 4h).
* Integración con pasarelas de pago, firmas digitales, portales inmobiliarios, servicios de mensajería y software contable.
* API pública (REST/GraphQL) para integraciones y futuras apps móviles.
* Observabilidad completa: métricas, logs y trazas distribuidas.
* Despliegue en nube pública (AWS/Azure/GCP) sobre infraestructuras containerizadas.

---

## 3. Vista de alto nivel (componentes principales)

Arquitectura **orientada a microservicios** (preferible) o **modular monolito** inicialmente si se quiere acelerar MVP. Recomendación: empezar con **modular monolito** bien estratificado (Backend API + Worker queue) y migrar a microservicios por dominio cuando la carga y complejidad lo justifiquen.

Componentes:

1. **API Gateway**

   * Punto único de entrada (autenticación, enrutamiento, rate limiting, WAF básico).
   * Tecnologías: AWS API Gateway / NGINX / Kong.

2. **Backend (Core API)**

   * Exponer APIs RESTful y/o GraphQL.
   * Lógica de negocio: propiedades, contratos, inquilinos, pagos, mantenimiento, reportes.
   * Tech candidates: Node.js (NestJS/Express), Python (FastAPI/Django), Java (Spring Boot), Go.
   * Autenticación: OAuth2 + JWT + refresh tokens.

3. **Servicios asíncronos / Workers**

   * Procesamiento de tareas en background: cobros recurrentes, envío de notificaciones, generación de reportes, conciliaciones.
   * Broker: RabbitMQ / AWS SQS / Kafka.
   * Workers: contenedores que consumen tareas.

4. **Base de datos relacional**

   * PostgreSQL (preferible) por consistencia transaccional y consultas complejas.
   * Patrón: esquema multi-tenant por compañía (si se requiere) o por esquema.
   * Read replicas para consultas intensivas y reportes.

5. **Datastore para documentos / archivos**

   * Almacenamiento de fotos, contratos PDF firmados, recibos.
   * Amazon S3 / Azure Blob / GCS.
   * CDN para servir imágenes y archivos públicos.

6. **Motor de búsqueda / indexación**

   * Para búsquedas rápidas por dirección, filtro, texto completo.
   * Elasticsearch / OpenSearch.

7. **Cache distribuida**

   * Redis para caching, sessions, locks y rate limits.

8. **Bus de eventos / Event Store (opcional)**

   * Para integraciones con terceros y auditoría: Kafka / AWS EventBridge.

9. **Autenticación y autorización**

   * Servicio de Auth (Keycloak / Auth0 / Cognito) o módulo propio (JWT + RBAC).
   * Soportar 2FA, SSO para empresas grandes y SAML opcional.

10. **Portal web (front-end)**

    * SPA con React / Next.js o Vue.js.
    * SSR opcional para SEO en secciones públicas (listado de propiedades).

11. **Portal móvil**

    * PWA inicial + apps nativas futuras (React Native / Flutter) consumiendo las mismas APIs.

12. **Integraciones externas**

    * **Pasarelas de pago**: MercadoPago (AR/BR/MX), Stripe.
    * **Bancos (Argentina)**: Bind (API bancaria, CVU virtuales), Pomelo (BaaS), Ualá.
    * **Blockchain/Crypto**: Bitcoin (xpub para direcciones HD), Lightning Network, Ethereum/Polygon (smart contracts).
    * **Facturación electrónica**: ARCA (ex AFIP) para Argentina - WSAA + WSFEv1.
    * **Índices de inflación**: BCRA API (ICL para Ley 27.551), BCB/FGV (IGP-M Brasil).
    * **Tipos de cambio**: BCRA API (USD/ARS, BRL/ARS), BCB (USD/BRL).
    * **Firmas digitales**: DocuSign, Adobe Sign, proveedores locales.
    * **Portales inmobiliarios**: APIs de publicación.
    * **Servicios de whatsapp**: WhatsApp Cloud API.
    * **Sistemas contables**: Export / SFTP / API.

13. **Observability stack**

    * Metrics: Prometheus + Grafana.
    * Tracing: OpenTelemetry + Jaeger.
    * Logs: ELK stack (Elasticsearch/Logstash/Kibana) o hosted (Datadog, Logz.io).

14. **CI/CD pipeline**

    * GitHub Actions / GitLab CI / Azure DevOps.
    * Contenedores: Docker, Registry privado (ECR/GCR/ACR).

15. **Infraestructura & Orquestación**

    * Kubernetes (EKS/GKE/AKS) recomendado para producción; Terraform para IaC.

---

## 4. Diseño de datos — Modelo conceptual (alto nivel)

Entidades principales (resumen):

* `Company` (si multi-tenant, incluye config ARCA y agente de retención)
* `Property` (id, dirección, geo, tipo, características, owner_id, estado)
* `Unit` (si inmuebles tienen múltiples unidades: unidad_id, piso, número)
* `Owner` / `Propietario` (persona jurídica o natural)
* `Tenant` / `Inquilino` (persona)
* `TenantAccount` (cuenta corriente del inquilino, balance, movimientos)
* `Lease` / `Contract` (propiedad/unidad, tenant_id, inicio, fin, renta, depósito, índice de ajuste, multi-moneda, config ARCA)
* `Invoice` (factura con ajustes, retenciones, CAE ARCA, multi-moneda)
* `Payment` (invoice_id, monto, método, proveedor, status, crypto: tx_hash, confirmations)
* `Receipt` (recibo de pago, PDF)
* `Settlement` (liquidación a propietario, comisiones, retenciones, neto)
* `BankAccount` (cuentas bancarias propias, de owners, CVU virtuales por propiedad)
* `CryptoWallet` (Bitcoin xpub, Lightning node, Ethereum smart contracts)
* `BankReconciliation` (conciliación bancaria)
* `InflationIndex` (ICL, IGP-M histórico)
* `ExchangeRate` (USD/ARS, BRL/ARS histórico)
* `MaintenanceTicket` (property_id/unit, tenant_id, descripción, prioridad, estado, assigned_to, cost)
* `User` (credenciales, rol, referencia a owner/tenant/staff)
* `Document` (tipo, link S3, firmado, metadata)
* `NotificationLog` (tipo, destinatario, canal, status)
* `NotificationPreference` (preferencias de notificación por usuario)
* `AuditLog` (entity, action, user, timestamp, diff)
* `BillingJob` (auditoría de procesos batch)
* `ReportSchedule` / `ReportExecution` (reportes programados)

Normalizaciones y relaciones: relaciones 1:N entre `Property` y `Unit`; `Lease` linkea `Unit` y `Tenant`; `Payments` es histórico.

Indices recomendados: búsqueda por dirección, tenant_id, lease_id, payment.status, fulltext sobre descripción de tickets, geospatial index sobre coordenadas para búsquedas por mapa.

Consideraciones multi-tenant: separar datos por `company_id` en cada tabla o usar esquemas por tenant. Elegir según requisitos de aislamiento y volumen.

---

## 5. Patrones de comunicación y consistencia

* **Sincronía**: Peticiones HTTP/HTTPS entre front y API; API Gateway maneja autenticación y throttling.
* **Asincronía**: Tareas de larga duración (procesar cobros, reintentos de pagos, envío masivo de mensajes por WhatsApp, generación de reportes) a través de mensajes en la cola.
* **Event-driven**: publicar eventos importantes (pago_realizado, contrato_firmado, ticket_abierto) en un bus para integraciones y para alimentar analytics en tiempo real.
* **Consistency**: operación financiera y creación de recibos deben ser ACID en la base de datos transaccional. Para procesos que cruzan servicios, usar sagas/compensaciones (ej. si un pago falla luego de marcar como cobrado, disparar compensación que anula el estado y genera notificación).

---

## 6. Flujos técnicos (secuencias) — ejemplos

### 6.1 Cobro recurrente automático (resumen técnico)

1. Worker scheduler (cron) encola jobs diarios para cobros programados.
2. Worker extrae `Lease` con cobro pendiente y método de pago.
3. Llamada a PSP (MercadoPago).
4. PSP responde success/failure.

   * Success: crear `Payment`, generar `Receipt` (PDF), almacenar documento en S3, marcar pago como `pagado`, emitir evento `payment.completed`.
   * Failure: anotar intento, reintentos con backoff, notificar a tenant y administrador, emitir evento `payment.failed`.
5. Encolar tarea de conciliación contable para conciliación diaria.

### 6.2 Facturación por lotes (batch billing)

1. Cron ejecuta `batch billing --date today` diariamente.
2. Batch CLI busca contratos con facturación programada para hoy.
3. Para cada contrato:
   * Si tiene ajuste por índice habilitado: consultar BCRA API para obtener ICL, calcular variación.
   * Si es multi-moneda (USD/BRL): consultar tipo de cambio del día.
   * Calcular retenciones si la company es agente de retención (IIBB, IVA, Ganancias).
   * Crear `Invoice` con todos los campos.
   * Si ARCA está habilitado: emitir factura electrónica vía WSAA + WSFEv1, obtener CAE.
   * Enviar factura por email al tenant.
4. Registrar `BillingJob` con estadísticas de ejecución.

### 6.3 Procesamiento de pagos y liquidaciones

1. **MercadoPago**: Tenant paga → webhook notifica → confirmar pago → generar recibo → programar liquidación.
2. **Transferencia bancaria**: Batch `reconcile-bank` lee movimientos de Bind API → match por alias o monto → confirmar pago.
3. **Crypto**: Batch `check-crypto` verifica confirmaciones en blockchain → cuando alcanza threshold → confirmar pago.
4. **Liquidación**: Batch `process-settlements` procesa liquidaciones programadas → transfiere a owner vía banco o crypto → notifica.

### 6.4 Firma digital de contrato

1. Admin genera `Lease` en estado `pendiente_firma`.
2. Backend crea documento PDF y solicita firma al proveedor (DocuSign API).
3. Proveedor envía email al tenant; tenant firma; proveedor notifica webhook a la plataforma.
4. Backend recibe webhook, descarga documento firmado, lo almacena en S3 y actualiza `Lease` a `vigente`. Emitir evento `contract.signed`.

### 6.5 Solicitud de mantenimiento

1. Inquilino crea ticket vía portal (API POST).
2. API valida y almacena ticket en DB, notifica a queue `maintenance.new`.
3. Dispatcher (worker) asigna a técnico (reglas = zona, carga, prioridad) y actualiza estado.
4. Técnico actualiza progreso; al cerrar, generar factura si aplica y notificar a owner.

---

## 7. Seguridad

* **Autenticación**: OAuth2 + JWT para APIs. Refresh tokens con revocación en DB.
* **Autorización**: RBAC; claims en JWT con `role`, `company_id`, `scopes`.
* **Cifrado**: TLS 1.2+ en tránsito; cifrado en reposo (DB TDE o cifrado a nivel storage). Archivos sensibles en S3 con claves KMS.
* **Protección de endpoints**: WAF (AWS WAF / Cloudflare), rate limiting en API Gateway.
* **Secret management**: Vault / AWS Secrets Manager / Azure Key Vault.
* **Auditoría**: loggear cambios en contratos, pagos y accesos con trazabilidad (who/when/what). Mantener logs inmutables y retención acorde a normativas.
* **Seguridad operativa**: hardening de contenedores, escaneo de imágenes (Trivy), políticas de IAM mínimas.
* **Protección de datos personales**: cumplir normativas locales (p. ej. Ley de Protección de Datos), anonimizar datos en backups si es requerido.

---

## 8. Escalabilidad y disponibilidad

* **Escalamiento de API**: Horizontal por replicas en K8s + autoscaler (HPA) con CPU/RAM y latencia.
* **Base de datos**: Primary + read replicas; particionado (sharding) cuando el dataset lo requiera. Backups incrementales y snapshot diario.
* **Workers**: autoescalado por tamaño de cola.
* **CDN**: para static assets.
* **Failover**: multi-AZ para DB y servicios críticos. Plan de DR en otra región (snapshots cross-region).
* **Caching**: Redis para evitar sobrecarga en DB para endpoints que admiten datos menos dinámicos (listados de barrios, tipos).

---

## 9. Observabilidad y gestión operacional

* **Logs**: centralizados (Fluentd/Logstash -> Elasticsearch / Logz). Guardar request_id para trazabilidad.
* **Métricas**: instrumentar con Prometheus; dashboards en Grafana para KPIs (latencia, error rate, jobs pendientes, cashflow processing).
* **Tracing**: OpenTelemetry propagando trace-id desde API Gateway hasta workers; Jaeger para visualización y debugging de performance.
* **Alerting**: PagerDuty/Opsgenie para alertas críticas (DB down, error en cobros, queue backlog).
* **Healthchecks**: endpoints `/health` y `/ready` para K8s liveness/readiness.

---

## 10. CI / CD y pipeline de despliegue

* **Repos**: mono-repo (opcional) o repos por servicio.
* **CI**: pipelines que corran tests unitarios, lint, análisis de seguridad (SAST), build de contenedor, y subida a registry.
* **CD**: pipelines que desplieguen a entornos `staging` y `prod`.
* **Pruebas**: run end-to-end en staging (Selenium / Cypress para front-end), contract tests para APIs.
* **Rollback**: keep last N images con posibilidad de rollback automático si healthcheck falla tras despliegue.
* **Feature flags**: LaunchDarkly / simple config para activar funcionalidades progresivamente.

---

## 11. Backup y recuperación

* **DB**: snapshots diarios + WAL continuous archiving; retention configurable (ej. 30 días).
* **Storage (S3)**: versioning habilitado; lifecycle policies para archivar a Glacier.
* **Restore drills**: pruebas trimestrales de restore (RTO < 2h).
* **Backups de config**: Terraform state seguro, rotación de secrets en Vault y backup de repository.

---

## 12. Integraciones y contratos API (resumen)

### 12.1 APIs Externas Consumidas

| Integración | Proveedor | Endpoint / Protocolo | Uso |
|-------------|-----------|---------------------|-----|
| **Índice ICL** | BCRA | `api.bcra.gob.ar/estadisticas/v2.0/datosvariable/41` | Ajuste por Ley 27.551 |
| **Índice IGP-M** | BCB | `api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados` | Ajuste alquileres Brasil |
| **TC USD/ARS** | BCRA | `api.bcra.gob.ar/estadisticas/v2.0/datosvariable/4` | Conversión moneda |
| **TC BRL/ARS** | BCRA | `api.bcra.gob.ar/estadisticas/v2.0/datosvariable/12` | Conversión moneda |
| **ARCA Auth** | ARCA (AFIP) | WSAA SOAP | Token para facturación |
| **ARCA Factura** | ARCA (AFIP) | WSFEv1 SOAP | Emisión CAE |
| **MercadoPago** | MercadoPago | `api.mercadopago.com` REST | Checkout, webhooks |
| **Bind API** | Bind | REST API | CVU virtuales, transferencias |
| **Bitcoin RPC** | Nodo propio / Blockstream | JSON-RPC | Verificar transacciones |
| **Lightning** | LND / CLN | gRPC / REST | Crear invoices, verificar pagos |
| **Ethereum RPC** | Infura / Alchemy | JSON-RPC | Verificar transacciones |
| **Polygon RPC** | Polygon | JSON-RPC | Verificar transacciones |
| **DocuSign** | DocuSign | REST API | Firma digital |
| **WhatsApp Cloud API** | WhatsApp Cloud API | REST API | Envío de mensajes por WhatsApp |
| **WhatsApp Cloud API** | WhatsApp Cloud API | REST API | SMS |

### 12.2 APIs Expuestas

* **Exponer**: APIs REST/GraphQL públicas para: autenticación, CRUD de propiedades/tenants/leases/payments/tickets, endpoints webhook para PSP y firma digital, endpoints para reportes (CSV/PDF).
* **Contratos**: usar OpenAPI (Swagger) y versionado de API (`/v1`, `/v2`). Mantener compatibilidad hacia atrás y políticas de deprecación.
* **Webhooks**: endpoints seguros con HMAC signature para validar origen (p. ej. de MercadoPago, Bind y DocuSign).
* **Rate limits**: por API key y por IP para evitar abuso.

---

## 13. Estrategia de despliegue y fases (roadmap técnico)

### Fase 0 — Preparación

* Repos, CI/CD básico, infraestructura IaC (Terraform), elección tech stack y PoC de DB.

### Fase 1 — MVP (3–4 meses estimados)

* Modular monolito con: autenticación, CRUD propiedades, inquilinos, contratos básicos, portal inquilinos/propietarios (PWA), pagos manuales, creación de tickets y básico de reportes.
* Integración con 1 PSP (Stripe/MercadoPago) y 1 proveedor de mails (WhatsApp Cloud API).
* Observability mínima (logs + métricas).

### Fase 2 — Producción y operación (1–2 meses)

* Hardening de seguridad, backups, SLA, monitorización completa, setup de alerts y DR plan.

### Fase 3 — Escalado funcional (siguientes 3–6 meses)

* Worker queue para cobranzas automáticas, firma digital, generación de recibos PDF, search (Elasticsearch), cache, read replicas.
* Separación a microservicios para pagos, notificaciones y reportes si la carga lo requiere.

### Fase 4 — Innovación y mejoras (continuo)

* IA para fijación de precios, automatización de renovaciones, integración IoT, BI avanzado.

---

## 14. Mapeo de requerimientos no funcionales a decisiones técnicas

* **Seguridad** → API Gateway + TLS, KMS, Vault, RBAC, WAF.
* **Escalabilidad** → Kubernetes + HPA, Redis, read replicas.
* **Disponibilidad** → Multi-AZ, healthchecks, backups cross-region.
* **Performance** → Caching (Redis), índices DB, Elasticsearch para búsquedas pesadas.
* **Mantenibilidad** → Modular code, tests, IaC, documentar APIs (OpenAPI).

---

## 15. Tech stack recomendado (ejemplo concreto)

* **Backend**: **Node.js + NestJS** o **Python + FastAPI**
* **Batch CLI**: **Node.js + Commander** (proyecto `/batch` separado)
* **Frontend**: **React + Next.js** (PWA)
* **DB relacional**: **PostgreSQL** (RDS / CloudSQL)
* **Cache**: **Redis** (Elasticache)
* **Cola**: **RabbitMQ** o **AWS SQS**
* **Search**: **Elasticsearch / OpenSearch**
* **Storage**: **S3** (o equivalente)
* **Auth**: **Keycloak** o **Cognito / Auth0**
* **Observability**: **Prometheus + Grafana**, **Jaeger**, **ELK**
* **Infra**: **Kubernetes (EKS/GKE/AKS)**, **Terraform**, **Helm**
* **CI/CD**: **GitHub Actions** o **GitLab CI**
* **PSP**: **MercadoPago** (AR/BR/MX)
* **Bancos**: **Bind** (API bancaria Argentina)
* **Crypto**: **bitcoinjs-lib**, **ethers.js**, **lnurl-pay**
* **Facturación electrónica**: **soap** (para ARCA/AFIP)
* **Firma digital**: **DocuSign** / proveedor local
* **WhatsApp**: **WhatsApp Cloud API**
* **Índices/TC**: **BCRA API**, **BCB API**

---

## 16. Pruebas y calidad

* **Unit tests** para cada módulo. Coverage objetivo > 70%.
* **Integration tests** para flujos: firma digital, cobro, generación de recibos.
* **E2E tests** para portals críticos (login, contrato, pago, ticket).
* **Load testing**: Gatling / k6 para simular picos (cobros masivos del día 1).
* **Security tests**: SAST/DAST periódicos (SonarQube, OWASP ZAP).
* **Pen testing** anual o ante cambios relevantes.

---

## 17. Operaciones y SOPs (procedimientos)

* Runbook: cómo resolver fallos de cobro masivo, restauración DB, bloqueo de users con actividad sospechosa.
* On-call rota, playbooks de emergencia y comunicación.
* Política de deployment: ventanas de mantenimiento, calendario de releases, alerts.

---

## 18. Consideraciones regulatorias y legales

* Almacenar logs de transacciones por el tiempo requerido por normativa fiscal local.
* Facturación electrónica integrada con las autoridades fiscales del país (si aplica).
* Tratamiento de datos personales acorde a la ley de datos vigente (consentimiento, acceso, rectificación, eliminación).

---

## 19. Riesgos técnicos y mitigaciones

* **Complejidad de integraciones**: mitigar con contratos API y simuladores (sandbox) de PSP/DocuSign.
* **Carga en día de cobros**: escalado previo y pruebas de carga; usar processing batch y backoff.
* **Fuga de datos sensibles**: cifrado, auditoría y pentesting.
* **Dependencia de terceros**: diseñar fallbacks (p. ej. reintentos, colas), políticas SLA con proveedores.

---

## 20. Entregables y métricas de éxito (KPI iniciales)

* MVP funcional con módulos: propiedades, contratos, inquilinos, pagos manuales, tickets, portal PWA.
* KPIs: tiempo medio de respuesta API (<300 ms), porcentaje de ocupación de la cola de workers (backlog ~0), tasa de éxito de cobros (meta > 95%), Uptime 99.9%.
* Métricas de negocio: reducción de tiempo administrativo por operación, % digitalización de contratos, % pagos recurrentes activados.

---

## 21. Anexos — Diagramas sugeridos (a producir)

* Diagrama de componentes (C4 - System context y Container).
* Diagrama de despliegue (K8s clusters, VPC, subnets, NAT, RDS).
* Secuencia de cobro recurrente y secuencia de firma digital (detalladas con mensajes HTTP y eventos).
* Modelo ER completo con campos principales.

---

## 22. Notas finales y recomendaciones prácticas

* Empezar con un **modular monolito** para aumentar velocidad de entrega; migrar a microservicios según evidencia de carga y desacoplamiento necesario.
* Priorizar la automatización: tests, CI/CD, IaC.
* Implementar observabilidad desde el día 0 (instrumentar logs y traces) — es más barato detectar problemas temprano que arreglarlos en producción.
* Diseñar para compensación: operaciones distribuidas (pagos, firmas) deben tener sagas/compensaciones claras.

---

* el **diagrama C4** (nivel contenedor + componentes) en formato SVG/PNG,
* el **ERD** (modelo relacional) en SQL DDL inicial,
* o un **playbook** para despliegue en AWS con Terraform y manifestos Helm para los servicios críticos.

Dime cuál de esos entregables quieres a continuación y lo pongo listo (genero incluso ejemplos de tablas SQL y manifiestos Kubernetes).
