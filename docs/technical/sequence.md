# Flujos de Procesos (Secuencia)

### 1. Cobro Recurrente Automático

```mermaid
sequenceDiagram
    participant Scheduler
    participant Worker
    participant PSP as Pasarela Pago
    participant DB
    participant Email

    Scheduler->>Worker: Trigger cobros diarios
    Worker->>DB: Buscar contratos con cobro pendiente
    DB-->>Worker: Lista de contratos
    
    loop Para cada contrato
        Worker->>PSP: Procesar cobro (Token)
        alt Pago Exitoso
            PSP-->>Worker: Success
            Worker->>DB: Crear registro Payment
            Worker->>DB: Actualizar estado cuenta
            Worker->>Email: Enviar recibo
        else Pago Fallido
            PSP-->>Worker: Error
            Worker->>DB: Registrar intento fallido
            Worker->>Email: Notificar fallo pago
        end
    end
```

### 2. Firma Digital de Contrato

```mermaid
sequenceDiagram
    participant Admin
    participant Backend
    participant DocuSign
    participant Tenant
    participant Webhook

    Admin->>Backend: Generar Contrato
    Backend->>DocuSign: Crear sobre (Envelope) con PDF
    DocuSign-->>Backend: Envelope ID
    Backend->>DocuSign: Enviar a firmantes
    
    DocuSign->>Tenant: Email con link de firma
    Tenant->>DocuSign: Firma documento online
    
    DocuSign->>Webhook: Evento: Signed
    Webhook->>Backend: Procesar webhook
    Backend->>DocuSign: Descargar PDF firmado
    Backend->>Backend: Guardar en S3
    Backend->>Backend: Activar contrato en DB
```

### 3. Solicitud de Mantenimiento

```mermaid
sequenceDiagram
    participant Tenant
    participant API
    participant DB
    participant Worker
    participant Staff

    Tenant->>API: POST /tickets (descripción, fotos)
    API->>DB: Guardar Ticket (Estado: Nuevo)
    API->>Worker: Evento: ticket.created
    API-->>Tenant: Ticket ID creado

    Worker->>DB: Buscar técnico disponible (Reglas)
    Worker->>DB: Asignar Ticket -> Staff
    Worker->>Staff: Notificación Push/Email

    Staff->>API: Aceptar ticket / Actualizar estado
    API->>DB: Update Ticket (Estado: En Progreso)
    API->>Tenant: Notificación: Técnico en camino
```

### 4. Registro de Nuevo Alquiler

```mermaid
sequenceDiagram
    participant Admin
    participant CRM
    participant Property
    participant Lease
    participant Payment
    participant DocuSign
    participant Notification

    Admin->>CRM: Convertir Lead a Tenant
    CRM->>Property: Verificar disponibilidad de unidad
    Property-->>CRM: Unidad disponible
    
    CRM->>Lease: Crear contrato (draft)
    Lease->>DocuSign: Generar documento para firma
    DocuSign-->>Lease: Documento enviado
    
    Lease->>Notification: Notificar a tenant y owner
    
    Note over DocuSign,Tenant: Tenant firma contrato
    
    DocuSign->>Lease: Webhook: Contrato firmado
    Lease->>Lease: Activar contrato
    Lease->>Property: Actualizar estado unidad (Alquilada)
    
    Lease->>Payment: Programar cobros recurrentes
    Payment->>Notification: Confirmar setup de pagos
```

### 5. Generación de Reportes

```mermaid
sequenceDiagram
    participant Admin
    participant ReportAPI
    participant ReportService
    participant DB
    participant Worker
    participant S3
    participant Email

    Admin->>ReportAPI: POST /reports/generate (template, params)
    ReportAPI->>ReportService: Validar parámetros
    ReportService->>DB: Crear registro de ejecución
    ReportService->>Worker: Encolar job de reporte
    ReportAPI-->>Admin: Job ID creado

    Worker->>DB: Extraer datos según filtros
    DB-->>Worker: Dataset
    
    Worker->>Worker: Procesar y formatear datos
    
    alt Exportar a PDF
        Worker->>Worker: Generar PDF
        Worker->>S3: Subir archivo PDF
    else Exportar a Excel
        Worker->>Worker: Generar Excel
        Worker->>S3: Subir archivo Excel
    end
    
    S3-->>Worker: URL del archivo
    Worker->>DB: Actualizar ejecución (Completado)
    Worker->>Email: Enviar notificación con link
    Email->>Admin: Email con reporte adjunto
```

### 6. Captura y Seguimiento de Leads (CRM)

```mermaid
sequenceDiagram
    participant WebForm
    participant CRM
    participant DB
    participant Property
    participant Notification
    participant Agent

    WebForm->>CRM: POST /leads (nombre, email, requerimientos)
    CRM->>DB: Guardar Lead (Estado: Nuevo)
    CRM->>Property: Buscar propiedades que coincidan
    Property-->>CRM: Lista de propiedades sugeridas
    
    CRM->>DB: Guardar matches automáticos
    CRM->>Notification: Alertar agente asignado
    Notification->>Agent: Email/SMS: Nuevo lead con matches
    
    Agent->>CRM: Registrar actividad (llamada)
    CRM->>DB: Guardar LEAD_ACTIVITY
    
    Agent->>CRM: Actualizar estado (Contactado)
    CRM->>DB: Update Lead status
    
    alt Lead interesado
        Agent->>CRM: Programar visita
        CRM->>Notification: Enviar confirmación a lead
    else Lead no interesado
        Agent->>CRM: Marcar como cerrado
        CRM->>DB: Update status (Cerrado)
    end
```

### 7. Renovación de Contrato

```mermaid
sequenceDiagram
    participant Scheduler
    participant Lease
    participant DB
    participant Notification
    participant Tenant
    participant Owner
    participant Admin

    Scheduler->>Lease: Verificar contratos próximos a vencer
    Lease->>DB: Buscar contratos (vencimiento < 60 días)
    DB-->>Lease: Lista de contratos
    
    loop Para cada contrato
        Lease->>DB: Verificar historial de pagos
        
        alt Buen historial
            Lease->>Notification: Enviar propuesta de renovación
            Notification->>Tenant: Email con términos de renovación
            Notification->>Owner: Notificar propuesta enviada
            
            Tenant->>Lease: Aceptar renovación (1-click)
            Lease->>DB: Crear LEASE_AMENDMENT
            Lease->>DB: Actualizar fechas de contrato
            Lease->>Notification: Confirmar renovación
        else Historial con problemas
            Lease->>Notification: Alertar admin para revisión manual
            Notification->>Admin: Contrato requiere revisión
        end
    end
```

