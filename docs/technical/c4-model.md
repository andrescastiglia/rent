# Diagramas Técnicos del Sistema

Este documento contiene los diagramas arquitectónicos 

## 1. Contexto del Sistema (C4 Nivel 1)

### 1.1 Vista Simplificada - Actores Principales

Muestra los usuarios principales y el sistema central.

```mermaid
C4Context
    title Contexto del Sistema - Vista Simplificada

    Enterprise_Boundary(b0, "Inmobiliaria / Administración") {
        Person(admin, "Administrador", "Gestiona el sistema completo")
        Person(staff, "Personal de Mantenimiento", "Atiende tickets")
    }

    Person(owner, "Propietario", "Dueño de propiedades")
    Person(tenant, "Inquilino", "Arrendatario")

    System(rental_system, "Plataforma de Alquileres", "Sistema central de gestión de propiedades, contratos, pagos y mantenimiento")

    Rel(admin, rental_system, "Configura y gestiona", "Web")
    Rel(staff, rental_system, "Gestiona mantenimiento", "Mobile")
    Rel(owner, rental_system, "Consulta rendimiento", "Web/Mobile")
    Rel(tenant, rental_system, "Paga renta y reporta", "Web/Mobile")
```

### 1.2 Vista Detallada - Integraciones Externas

Muestra todas las integraciones con sistemas externos.

```mermaid
C4Context
    title Contexto del Sistema - Integraciones Externas

    System(rental_system, "Plataforma de Alquileres", "Sistema central")

    System_Boundary(financial, "Sistemas Financieros") {
        System_Ext(psp, "Pasarela de Pagos", "MercadoPago")
        System_Ext(bank, "API Bancaria", "Bind, Pomelo")
        System_Ext(crypto, "Blockchain", "Bitcoin, Lightning, Ethereum")
        System_Ext(accounting, "Facturación Electrónica", "ARCA (ex AFIP)")
    }

    System_Boundary(indices, "Datos Financieros") {
        System_Ext(bcra, "BCRA API", "ICL, Tipo de Cambio")
        System_Ext(bcb, "BCB API", "IGP-M Brasil")
    }

    System_Boundary(legal, "Sistemas Legales") {
        System_Ext(docusign, "Firma Digital", "DocuSign, Adobe Sign")
    }

    System_Boundary(communication, "Sistemas de Comunicación") {
        System_Ext(email, "Email", "SendGrid")
        System_Ext(sms, "SMS", "Twilio")
        System_Ext(push, "Push Notifications", "Firebase")
    }

    System_Boundary(marketing, "Sistemas de Marketing") {
        System_Ext(portals, "Portales Inmobiliarios", "Airbnb, Zillow, Idealista")
        System_Ext(maps, "Mapas", "Google Maps, Mapbox")
    }

    %% Financial
    Rel(rental_system, psp, "Procesa pagos", "API/HTTPS")
    Rel(rental_system, bank, "Transferencias/CVU", "API/HTTPS")
    Rel(rental_system, crypto, "Pagos crypto", "RPC/HTTPS")
    Rel(rental_system, accounting, "Emite facturas", "SOAP/WS")

    %% Indices
    Rel(rental_system, bcra, "Índices ICL/TC", "API/HTTPS")
    Rel(rental_system, bcb, "Índice IGP-M", "API/HTTPS")

    %% Legal
    Rel(rental_system, docusign, "Firma contratos", "API/HTTPS")

    %% Communication
    Rel(rental_system, email, "Envía emails", "API/HTTPS")
    Rel(rental_system, sms, "Envía SMS", "API/HTTPS")
    Rel(rental_system, push, "Envía notificaciones", "API/HTTPS")

    %% Marketing
    Rel(rental_system, portals, "Publica propiedades", "API/XML")
    Rel(rental_system, maps, "Geolocalización", "API/HTTPS")
```

### 1.3 Vista Completa - Usuarios e Integraciones

Vista consolidada mostrando usuarios y sistemas externos.

```mermaid
C4Context
    title Contexto del Sistema - Vista Completa

    Enterprise_Boundary(b0, "Inmobiliaria") {
        Person(admin, "Administrador", "Gestión del sistema")
        Person(staff, "Staff", "Mantenimiento")
    }

    Person(owner, "Propietario", "Dueño")
    Person(tenant, "Inquilino", "Arrendatario")

    System(rental_system, "Plataforma de Alquileres", "Sistema central de gestión")

    System_Ext(psp, "Pagos", "Stripe/MercadoPago")
    System_Ext(docusign, "Firma Digital", "DocuSign")
    System_Ext(comm, "Comunicación", "Email/SMS/Push")
    System_Ext(accounting, "Contabilidad", "ERP/AFIP")
    System_Ext(portals, "Portales", "Airbnb/Zillow")

    %% Users
    Rel(admin, rental_system, "Gestiona", "HTTPS")
    Rel(staff, rental_system, "Mantenimiento", "Mobile")
    Rel(owner, rental_system, "Consulta", "Web/Mobile")
    Rel(tenant, rental_system, "Usa", "Web/Mobile")

    %% External Systems
    Rel(rental_system, psp, "Pagos", "API")
    Rel(rental_system, docusign, "Firmas", "API")
    Rel(rental_system, comm, "Notifica", "API")
    Rel(rental_system, accounting, "Factura", "API")
    Rel(rental_system, portals, "Publica", "API")
```


## 2. Contenedores (C4 Nivel 2)

Detalla la arquitectura interna del sistema, mostrando las aplicaciones, servicios y bases de datos.

### 2.1 Vista Frontend - Aplicaciones de Usuario

Muestra las aplicaciones frontend y su interacción con el API Gateway.

```mermaid
C4Container
    title Contenedores - Capa Frontend

    Person(user, "Usuario", "Todos los tipos de usuarios")

    Container_Boundary(frontend, "Frontend Layer") {
        Container(web_app, "Web App (SPA)", "Next.js / React", "Portal administrativo y de clientes")
        Container(mobile_app, "Mobile App", "React Native", "App nativa para inquilinos/propietarios")
        Container(landing, "Landing Page", "Next.js (SSR)", "Sitio público y captación de leads")
    }

    Container(cdn, "CDN", "CloudFront / Cloudflare", "Cache de assets estáticos")
    Container(api_gateway, "API Gateway", "Kong / AWS API Gateway", "Routing, Auth, Rate Limiting")

    Rel(user, web_app, "Usa", "HTTPS")
    Rel(user, mobile_app, "Usa", "HTTPS")
    Rel(user, landing, "Visita", "HTTPS")
    
    Rel(web_app, cdn, "Carga assets", "HTTPS")
    Rel(web_app, api_gateway, "API Calls", "JSON/HTTPS")
    Rel(mobile_app, api_gateway, "API Calls", "JSON/HTTPS")
    Rel(landing, api_gateway, "API Calls", "JSON/HTTPS")
```

### 2.2 Vista Backend Core - Procesamiento

Muestra los servicios backend y su comunicación interna.

```mermaid
C4Container
    title Contenedores - Backend Core

    Container(api_gateway, "API Gateway", "Kong", "Punto de entrada")

    Container_Boundary(backend, "Backend Layer") {
        Container(backend_api, "Backend API", "Node.js (NestJS)", "Lógica de negocio y API REST/GraphQL")
        Container(worker, "Worker Service", "Node.js / Python", "Procesamiento asíncrono")
        ContainerQueue(queue, "Message Broker", "RabbitMQ / SQS", "Cola de eventos")
    }

    System_Ext(psp, "Pasarela de Pagos", "Stripe/MercadoPago")
    System_Ext(docusign, "Firma Digital", "DocuSign")
    System_Ext(email, "Email Service", "SendGrid")

    %% Gateway to Backend
    Rel(api_gateway, backend_api, "Proxies requests", "HTTP")

    %% Backend Internals
    Rel(backend_api, queue, "Publish events", "AMQP")
    Rel(queue, worker, "Consume tasks", "AMQP")

    %% External Integrations
    Rel(backend_api, docusign, "Firma contratos", "API/HTTPS")
    Rel(backend_api, psp, "Inicia checkout", "API/HTTPS")
    Rel(worker, psp, "Cobros batch", "API/HTTPS")
    Rel(worker, email, "Envía notificaciones", "API/HTTPS")
```

### 2.3 Vista Data Layer - Almacenamiento

Muestra las bases de datos y sistemas de almacenamiento.

```mermaid
C4Container
    title Contenedores - Data Layer

    Container(backend_api, "Backend API", "NestJS", "Lógica de negocio")
    Container(worker, "Worker Service", "Node.js", "Procesamiento asíncrono")

    Container_Boundary(data, "Data Layer") {
        ContainerDb(db, "Base de Datos", "PostgreSQL", "Datos relacionales")
        ContainerDb(redis, "Cache & Session", "Redis", "Cache y sesiones")
        ContainerDb(search, "Search Engine", "Elasticsearch", "Búsqueda full-text")
        ContainerDb(s3, "Object Storage", "AWS S3", "Documentos y fotos")
    }

    %% Backend API to Data
    Rel(backend_api, db, "Reads/Writes", "SQL/ORM")
    Rel(backend_api, redis, "Cache/Session", "TCP")
    Rel(backend_api, search, "Search queries", "HTTP")
    Rel(backend_api, s3, "Presigned URLs", "HTTP")

    %% Worker to Data
    Rel(worker, db, "Reads/Writes", "SQL")
    Rel(worker, s3, "Upload reports", "HTTP")
    Rel(worker, search, "Index updates", "HTTP")
```

### 2.4 Vista Completa - Arquitectura General

Vista consolidada mostrando todas las capas y sus interacciones principales.

```mermaid
C4Container
    title Contenedores - Vista Completa

    Person(user, "Usuario", "Todos los roles")

    Container_Boundary(c1, "Frontend") {
        Container(web_app, "Web App", "Next.js", "Portal web")
        Container(mobile_app, "Mobile App", "React Native", "App móvil")
    }

    Container(api_gateway, "API Gateway", "Kong", "Routing & Auth")

    Container_Boundary(c2, "Backend") {
        Container(backend_api, "Backend API", "NestJS", "Lógica de negocio")
        Container(worker, "Worker", "Node.js", "Async processing")
        ContainerQueue(queue, "Queue", "RabbitMQ", "Eventos")
    }

    Container_Boundary(c3, "Data") {
        ContainerDb(db, "Database", "PostgreSQL", "Datos")
        ContainerDb(redis, "Cache", "Redis", "Cache")
        ContainerDb(s3, "Storage", "S3", "Archivos")
    }

    System_Ext(psp, "Pagos", "Stripe")
    System_Ext(email, "Email", "SendGrid")

    %% User to Frontend
    Rel(user, web_app, "Usa", "HTTPS")
    Rel(user, mobile_app, "Usa", "HTTPS")

    %% Frontend to Gateway
    Rel(web_app, api_gateway, "API", "HTTPS")
    Rel(mobile_app, api_gateway, "API", "HTTPS")

    %% Gateway to Backend
    Rel(api_gateway, backend_api, "Proxy", "HTTP")

    %% Backend Internal
    Rel(backend_api, queue, "Publish", "AMQP")
    Rel(queue, worker, "Consume", "AMQP")

    %% Backend to Data
    Rel(backend_api, db, "R/W", "SQL")
    Rel(backend_api, redis, "Cache", "TCP")
    Rel(backend_api, s3, "Files", "HTTP")

    %% Worker to Data
    Rel(worker, db, "R/W", "SQL")

    %% External
    Rel(backend_api, psp, "Pagos", "API")
    Rel(worker, email, "Emails", "API")
```


## 3. Componentes (C4 Nivel 3)

Detalle de los componentes internos del contenedor **Backend API**, organizados por dominio funcional.

### 3.1 Módulos Core Business (Auth, Property, Tenant, Lease)

```mermaid
C4Component
    title Componentes - Módulos Core Business

    Container(api_gateway, "API Gateway", "Kong", "Enrutamiento")
    ContainerDb(db, "Database", "PostgreSQL", "Persistencia")

    Container_Boundary(core, "Core Business Modules") {
        %% Auth
        Component(auth_ctrl, "Auth Controller", "Controller", "Login/Register")
        Component(auth_svc, "Auth Service", "Service", "JWT & Auth")
        
        %% Property
        Component(prop_ctrl, "Property Controller", "Controller", "CRUD Propiedades")
        Component(prop_svc, "Property Service", "Service", "Lógica inmobiliaria")
        
        %% Tenant
        Component(tenant_ctrl, "Tenant Controller", "Controller", "CRUD Inquilinos")
        Component(tenant_svc, "Tenant Service", "Service", "Validaciones")
        
        %% Lease
        Component(lease_ctrl, "Lease Controller", "Controller", "Gestión contratos")
        Component(lease_svc, "Lease Service", "Service", "Lógica contratos")

        %% Relationships
        Rel(auth_ctrl, auth_svc, "Usa")
        Rel(prop_ctrl, prop_svc, "Usa")
        Rel(tenant_ctrl, tenant_svc, "Usa")
        Rel(lease_ctrl, lease_svc, "Usa")
        
        Rel(lease_svc, prop_svc, "Valida disponibilidad")
        
        Rel(auth_svc, db, "R/W User")
        Rel(prop_svc, db, "R/W Property")
        Rel(tenant_svc, db, "R/W Tenant")
        Rel(lease_svc, db, "R/W Lease")
    }

    Rel(api_gateway, auth_ctrl, "HTTPS")
    Rel(api_gateway, prop_ctrl, "HTTPS")
    Rel(api_gateway, tenant_ctrl, "HTTPS")
    Rel(api_gateway, lease_ctrl, "HTTPS")
```

### 3.2 Módulos de Operaciones (Payment, CRM, Maintenance)

```mermaid
C4Component
    title Componentes - Módulos de Operaciones

    Container(api_gateway, "API Gateway", "Kong", "Enrutamiento")
    ContainerDb(db, "Database", "PostgreSQL", "Persistencia")

    Container_Boundary(ops, "Operations Modules") {
        %% Payment
        Component(payment_ctrl, "Payment Controller", "Controller", "Procesamiento pagos")
        Component(payment_svc, "Payment Service", "Service", "Integración PSP")
        
        %% CRM
        Component(crm_ctrl, "CRM Controller", "Controller", "Gestión leads")
        Component(crm_svc, "CRM Service", "Service", "Seguimiento comercial")
        
        %% Maintenance
        Component(maint_ctrl, "Maintenance Controller", "Controller", "Gestión tickets")
        Component(maint_svc, "Maintenance Service", "Service", "Asignación técnicos")

        %% Relationships
        Rel(payment_ctrl, payment_svc, "Usa")
        Rel(crm_ctrl, crm_svc, "Usa")
        Rel(maint_ctrl, maint_svc, "Usa")
        
        Rel(payment_svc, db, "R/W Payment")
        Rel(crm_svc, db, "R/W Lead")
        Rel(maint_svc, db, "R/W Ticket")
    }

    Rel(api_gateway, payment_ctrl, "HTTPS")
    Rel(api_gateway, crm_ctrl, "HTTPS")
    Rel(api_gateway, maint_ctrl, "HTTPS")
```

### 3.3 Módulos de Facturación y Cobranzas (Billing & Payments)

```mermaid
C4Component
    title Componentes - Módulos de Facturación y Cobranzas

    Container(batch_cli, "Batch CLI", "Node.js/Commander", "Procesos batch")
    ContainerDb(db, "Database", "PostgreSQL", "Persistencia")
    ContainerQueue(queue, "Queue", "RabbitMQ", "Eventos")
    
    System_Ext(bcra, "BCRA API", "Índices/TC")
    System_Ext(arca, "ARCA", "Factura electrónica")
    System_Ext(mp, "MercadoPago", "Pagos")
    System_Ext(bank, "Bind API", "Transferencias")
    System_Ext(blockchain, "Blockchain", "Bitcoin/ETH")

    Container_Boundary(billing, "Billing Module") {
        Component(billing_cmd, "Billing Command", "CLI", "billing --date")
        Component(billing_svc, "Billing Service", "Service", "Genera facturas")
        Component(adjustment_svc, "Adjustment Service", "Service", "Ajustes por índice")
        Component(exchange_svc, "ExchangeRate Service", "Service", "Tipos de cambio")
        Component(arca_svc, "ARCA Service", "Service", "Factura electrónica")
        Component(bcra_svc, "BCRA Service", "Service", "ICL, TC")
        
        Rel(billing_cmd, billing_svc, "Ejecuta")
        Rel(billing_svc, adjustment_svc, "Calcula ajuste")
        Rel(billing_svc, exchange_svc, "Convierte moneda")
        Rel(billing_svc, arca_svc, "Emite CAE")
        Rel(adjustment_svc, bcra_svc, "Obtiene ICL")
        Rel(exchange_svc, bcra_svc, "Obtiene TC")
        Rel(bcra_svc, bcra, "API")
        Rel(arca_svc, arca, "SOAP/WS")
        Rel(billing_svc, db, "R/W Invoice")
    }

    Container_Boundary(payments, "Payments Module") {
        Component(payment_svc, "Payment Service", "Service", "Registra/confirma pagos")
        Component(mp_svc, "MercadoPago Service", "Service", "Checkout/Webhooks")
        Component(crypto_svc, "Crypto Service", "Service", "BTC/LN/ETH")
        Component(bank_svc, "Bank Transfer Service", "Service", "CVU/Alias")
        Component(receipt_svc, "Receipt Service", "Service", "Genera recibos")
        
        Rel(payment_svc, mp_svc, "MercadoPago")
        Rel(payment_svc, crypto_svc, "Crypto")
        Rel(payment_svc, bank_svc, "Transferencias")
        Rel(payment_svc, receipt_svc, "Genera recibo")
        Rel(mp_svc, mp, "API")
        Rel(bank_svc, bank, "API")
        Rel(crypto_svc, blockchain, "RPC")
        Rel(payment_svc, db, "R/W Payment")
        Rel(receipt_svc, db, "R/W Receipt")
    }

    Container_Boundary(settlements, "Settlements Module") {
        Component(settlement_svc, "Settlement Service", "Service", "Liquidaciones")
        Component(recon_svc, "Reconciliation Service", "Service", "Conciliación")
        
        Rel(payment_svc, settlement_svc, "Programa liquidación")
        Rel(settlement_svc, bank_svc, "Transfiere")
        Rel(settlement_svc, crypto_svc, "Transfiere crypto")
        Rel(recon_svc, bank_svc, "Lee movimientos")
        Rel(recon_svc, payment_svc, "Confirma pagos")
        Rel(settlement_svc, db, "R/W Settlement")
        Rel(recon_svc, db, "R/W Reconciliation")
    }

    Rel(batch_cli, billing_cmd, "Cron")
```

### 3.3 Módulos de Soporte (Reports, Notifications, Documents, Audit)

```mermaid
C4Component
    title Componentes - Módulos de Soporte

    Container(api_gateway, "API Gateway", "Kong", "Enrutamiento")
    ContainerDb(db, "Database", "PostgreSQL", "Persistencia")
    ContainerDb(s3, "Storage", "S3", "Archivos")
    ContainerQueue(queue, "Queue", "RabbitMQ", "Eventos")

    Container_Boundary(support, "Support Modules") {
        %% Report
        Component(report_ctrl, "Report Controller", "Controller", "Generación reportes")
        Component(report_svc, "Report Service", "Service", "Exportación PDF/Excel")
        
        %% Notification
        Component(notif_svc, "Notification Service", "Service", "Email/SMS/Push")
        
        %% Document
        Component(doc_svc, "Document Service", "Service", "Generación PDFs")
        
        %% Audit
        Component(audit_svc, "Audit Service", "Service", "Logs de auditoría")

        %% Relationships
        Rel(report_ctrl, report_svc, "Usa")
        
        Rel(report_svc, db, "Read Data")
        Rel(report_svc, s3, "Upload Reports")
        Rel(report_svc, queue, "Publish jobs")
        
        Rel(doc_svc, s3, "Upload/Download")
        
        Rel(notif_svc, queue, "Publish notifications")
        
        Rel(audit_svc, db, "Write Audit Log")
    }

    Rel(api_gateway, report_ctrl, "HTTPS")
```

### 3.4 Integraciones entre Módulos

```mermaid
C4Component
    title Componentes - Integraciones Cross-Module

    Container_Boundary(modules, "Backend API Modules") {
        Component(lease_svc, "Lease Service", "Service", "Contratos")
        Component(payment_svc, "Payment Service", "Service", "Pagos")
        Component(crm_svc, "CRM Service", "Service", "CRM")
        Component(maint_svc, "Maintenance Service", "Service", "Mantenimiento")
        Component(prop_svc, "Property Service", "Service", "Propiedades")
        Component(tenant_svc, "Tenant Service", "Service", "Inquilinos")
        Component(notif_svc, "Notification Service", "Service", "Notificaciones")
        Component(doc_svc, "Document Service", "Service", "Documentos")

        %% Cross-module relationships
        Rel(lease_svc, prop_svc, "Valida disponibilidad")
        Rel(lease_svc, doc_svc, "Genera contrato PDF")
        Rel(lease_svc, notif_svc, "Notifica vencimientos")
        
        Rel(payment_svc, lease_svc, "Actualiza saldo")
        Rel(payment_svc, notif_svc, "Notifica cobros")
        
        Rel(crm_svc, prop_svc, "Empareja propiedades")
        Rel(crm_svc, tenant_svc, "Convierte a inquilino")
        
        Rel(maint_svc, notif_svc, "Notifica asignaciones")
    }
```

### 3.5 Vista Completa - Todos los Componentes

```mermaid
C4Component
    title Componentes - Vista Completa Simplificada

    Container(gateway, "API Gateway", "Kong", "Entry point")
    ContainerDb(db, "DB", "PostgreSQL", "Data")
    ContainerDb(s3, "S3", "AWS", "Files")
    ContainerQueue(queue, "Queue", "RabbitMQ", "Events")

    Container_Boundary(api, "Backend API") {
        %% Controllers
        Component(auth_c, "Auth", "Ctrl", "Auth")
        Component(prop_c, "Property", "Ctrl", "Props")
        Component(lease_c, "Lease", "Ctrl", "Contracts")
        Component(pay_c, "Payment", "Ctrl", "Payments")
        Component(crm_c, "CRM", "Ctrl", "Leads")
        Component(maint_c, "Maintenance", "Ctrl", "Tickets")
        Component(report_c, "Report", "Ctrl", "Reports")
        
        %% Services
        Component(auth_s, "Auth", "Svc", "JWT")
        Component(prop_s, "Property", "Svc", "Props")
        Component(lease_s, "Lease", "Svc", "Contracts")
        Component(pay_s, "Payment", "Svc", "PSP")
        Component(crm_s, "CRM", "Svc", "Leads")
        Component(maint_s, "Maint", "Svc", "Tickets")
        Component(report_s, "Report", "Svc", "Reports")
        Component(notif_s, "Notif", "Svc", "Alerts")
        Component(doc_s, "Doc", "Svc", "PDFs")

        %% Key relationships
        Rel(auth_c, auth_s, "")
        Rel(prop_c, prop_s, "")
        Rel(lease_c, lease_s, "")
        Rel(pay_c, pay_s, "")
        Rel(crm_c, crm_s, "")
        Rel(maint_c, maint_s, "")
        Rel(report_c, report_s, "")
        
        Rel(lease_s, prop_s, "")
        Rel(pay_s, lease_s, "")
        Rel(lease_s, notif_s, "")
        
        Rel(auth_s, db, "")
        Rel(prop_s, db, "")
        Rel(lease_s, db, "")
        Rel(pay_s, db, "")
        Rel(doc_s, s3, "")
        Rel(notif_s, queue, "")
    }

    Rel(gateway, auth_c, "")
    Rel(gateway, prop_c, "")
    Rel(gateway, lease_c, "")
    Rel(gateway, pay_c, "")
```



## 4. Código (C4 Nivel 4)

Detalle de clases principales para todos los módulos del Backend API, organizados por dominio funcional.

### 4.1 Módulos Core (Auth, Property, Tenant, Lease)

```mermaid
classDiagram
    %% Auth Module
    class AuthController {
        +login(dto: LoginDto)
        +register(dto: RegisterDto)
        +refreshToken(token: string)
    }
    class AuthService {
        +validateUser(email, pass)
        +generateTokens(user)
    }
    class UserRepository {
        +findByEmail(email)
        +create(user)
    }

    %% Property Module
    class PropertyController {
        +createProperty(dto)
        +findAll(filter)
        +getDetails(id)
    }
    class PropertyService {
        +registerProperty(data)
        +updateStatus(id, status)
        +checkAvailability(id, dates)
    }
    class PropertyRepository {
        +save(prop)
        +findWithUnits(id)
    }

    %% Tenant Module
    class TenantController {
        +createTenant(dto)
        +updateTenant(id, dto)
        +getTenantHistory(id)
    }
    class TenantService {
        +validateIdentity(dni)
        +getPaymentHistory(id)
    }
    class TenantRepository {
        +save(tenant)
        +findByDni(dni)
    }

    %% Lease Module
    class LeaseController {
        +createLease(dto)
        +signLease(id)
        +renewLease(id, terms)
    }
    class LeaseService {
        +draftContract(data)
        +executeSignature(id)
        +terminate(id)
    }
    class LeaseRepository {
        +save(lease)
        +findActiveByTenant(tenantId)
    }

    %% Relationships
    AuthController --> AuthService
    AuthService --> UserRepository

    PropertyController --> PropertyService
    PropertyService --> PropertyRepository

    TenantController --> TenantService
    TenantService --> TenantRepository

    LeaseController --> LeaseService
    LeaseService --> LeaseRepository
    LeaseService --> PropertyService : Valida disponibilidad
```

### 4.2 Módulo Financiero (Billing, Payments & Settlements)

```mermaid
classDiagram
    %% Billing Module
    class BillingService {
        +generateInvoice(lease, date)
        +generateBatch(date)
        +calculateRetentions(invoice)
    }
    class AdjustmentService {
        +calculateAdjustedRent(lease)
        +shouldApplyAdjustment(lease)
        +getLatestIndex(indexCode)
    }
    class ExchangeRateService {
        +getRate(from, to, date)
        +convertAmount(amount, from, to)
    }
    class ArcaService {
        +emitInvoice(invoice)
        +getAuthToken()
        +generateQRData(invoice)
    }
    class BcraService {
        +getICL(fromDate, toDate)
        +getExchangeRate(currency, date)
    }

    %% Payment Module
    class PaymentController {
        +createPayment(dto)
        +handleWebhook(event)
        +getPaymentHistory(userId)
    }
    class PaymentService {
        +registerPayment(data)
        +confirmPayment(paymentId)
        +applyToInvoices(payment)
    }
    class MercadoPagoService {
        +createPreference(invoice)
        +handleWebhook(data)
        +getPaymentStatus(externalId)
    }
    class CryptoPaymentService {
        +checkPendingPayments()
        +generateBitcoinAddress(invoiceId)
        +generateLightningInvoice(invoiceId)
        +checkConfirmations(payment)
    }
    class BankTransferService {
        +getMovements(accountId, dateRange)
        +executeTransfer(settlement)
    }
    class ReceiptService {
        +generate(payment)
        +generatePDF(receipt)
        +sendByEmail(receipt)
    }

    %% Settlement Module
    class SettlementService {
        +scheduleForPayment(payment)
        +processScheduledSettlements()
        +calculateCommission(amount, type, rate)
        +transferFunds(settlement)
    }
    class ReconciliationService {
        +reconcileBankMovements(accountId)
        +findMatchingPayment(movement)
        +alertUnmatched(movement)
    }

    %% Repositories
    class InvoiceRepository {
        +save(invoice)
        +findPending(tenantAccountId)
        +findByLease(leaseId)
    }
    class PaymentRepository {
        +save(payment)
        +findById(id)
        +findPending(filters)
        +findByExternalId(provider, externalId)
    }
    class SettlementRepository {
        +save(settlement)
        +findScheduled(date)
        +findByOwner(ownerId)
    }

    %% Relationships - Billing
    BillingService --> AdjustmentService
    BillingService --> ExchangeRateService
    BillingService --> ArcaService
    BillingService --> InvoiceRepository
    AdjustmentService --> BcraService
    ExchangeRateService --> BcraService

    %% Relationships - Payments
    PaymentController --> PaymentService
    PaymentService --> PaymentRepository
    PaymentService --> MercadoPagoService
    PaymentService --> CryptoPaymentService
    PaymentService --> BankTransferService
    PaymentService --> ReceiptService
    PaymentService --> SettlementService

    %% Relationships - Settlements
    SettlementService --> SettlementRepository
    SettlementService --> BankTransferService
    SettlementService --> CryptoPaymentService
    ReconciliationService --> BankTransferService
    ReconciliationService --> PaymentService
```

### 4.3 Módulos de Operaciones (CRM, Maintenance, Reports)

```mermaid
classDiagram
    %% CRM Module
    class CRMController {
        +createLead(dto)
        +assignLead(id, userId)
        +matchProperties(leadId)
    }
    class CRMService {
        +autoMatch(requirements)
        +trackActivity(leadId, activity)
        +convertToTenant(leadId)
    }
    class LeadRepository {
        +save(lead)
        +findByStatus(status)
    }

    %% Maintenance Module
    class MaintenanceController {
        +createTicket(dto)
        +assignTicket(id, staffId)
        +updateStatus(id, status)
    }
    class MaintenanceService {
        +autoAssign(ticket)
        +calculateCost(ticketId)
        +notifyProgress(ticketId)
    }
    class TicketRepository {
        +save(ticket)
        +findByProperty(propertyId)
    }

    %% Report Module
    class ReportController {
        +generateReport(templateId, params)
        +scheduleReport(templateId, schedule)
        +listTemplates()
    }
    class ReportService {
        +executeReport(template, params)
        +exportToPdf(data)
        +exportToExcel(data)
    }
    class ReportRepository {
        +saveTemplate(template)
        +saveExecution(execution)
    }

    %% Relationships
    CRMController --> CRMService
    CRMService --> LeadRepository

    MaintenanceController --> MaintenanceService
    MaintenanceService --> TicketRepository

    ReportController --> ReportService
    ReportService --> ReportRepository
```

### 4.4 Módulos de Soporte (Notifications, Documents, Audit)

```mermaid
classDiagram
    %% Notification Module
    class NotificationService {
        +sendEmail(to, template, data)
        +sendSMS(phone, message)
        +sendPush(userId, notification)
        +scheduleNotification(notification, date)
    }
    class EmailProvider {
        <<interface>>
        +send(to, subject, body)
    }
    class SendGridProvider {
        +send(to, subject, body)
    }
    class SMSProvider {
        <<interface>>
        +send(phone, message)
    }
    class TwilioProvider {
        +send(phone, message)
    }
    class NotificationRepository {
        +save(log)
        +findByUser(userId)
    }

    %% Document Module
    class DocumentService {
        +generatePdf(template, data)
        +uploadToS3(file)
        +getSignedUrl(key)
        +signDocument(docId)
    }
    class DocumentRepository {
        +save(document)
        +findByEntity(entityType, entityId)
    }

    %% Audit Module
    class AuditService {
        +logAction(user, entity, action, changes)
        +getAuditTrail(entityId)
        +exportAuditLog(filters)
    }
    class AuditRepository {
        +save(auditLog)
        +findByEntity(entityId)
    }

    %% Relationships
    NotificationService --> EmailProvider
    NotificationService --> SMSProvider
    NotificationService --> NotificationRepository
    EmailProvider <|.. SendGridProvider
    SMSProvider <|.. TwilioProvider

    DocumentService --> DocumentRepository

    AuditService --> AuditRepository
```

### 4.5 Integraciones entre Módulos

```mermaid
classDiagram
    class LeaseService
    class PaymentService
    class CRMService
    class MaintenanceService
    class NotificationService
    class DocumentService
    class PropertyService
    class TenantService

    %% Cross-module relationships
    LeaseService --> DocumentService : Genera contrato PDF
    LeaseService --> NotificationService : Notifica vencimientos
    LeaseService --> PropertyService : Valida disponibilidad

    PaymentService --> LeaseService : Actualiza saldo
    PaymentService --> NotificationService : Notifica cobros

    CRMService --> PropertyService : Empareja propiedades
    CRMService --> TenantService : Convierte a inquilino

    MaintenanceService --> NotificationService : Notifica asignaciones
```



