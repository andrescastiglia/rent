# Flujos de Procesos (Secuencia)

### 1. Cobro Recurrente Automático

```mermaid
sequenceDiagram
    participant Scheduler
    participant Worker
    participant PSP as Pasarela Pago
    participant DB
    participant WhatsApp

    Scheduler->>Worker: Trigger cobros diarios
    Worker->>DB: Buscar contratos con cobro pendiente
    DB-->>Worker: Lista de contratos
    
    loop Para cada contrato
        Worker->>PSP: Procesar cobro (Token)
        alt Pago Exitoso
            PSP-->>Worker: Success
            Worker->>DB: Crear registro Payment
            Worker->>DB: Actualizar estado cuenta
            Worker->>WhatsApp: Enviar recibo
        else Pago Fallido
            PSP-->>Worker: Error
            Worker->>DB: Registrar intento fallido
            Worker->>WhatsApp: Notificar fallo pago
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
    
    DocuSign->>Tenant: WhatsApp con link de firma
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
    participant WhatsApp

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
    Worker->>WhatsApp: Enviar notificación con link
    WhatsApp->>Admin: WhatsApp con reporte adjunto
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
    Notification->>Agent: WhatsApp: Nuevo lead con matches
    
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
            Notification->>Tenant: WhatsApp con términos de renovación
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

---

## Flujos de Facturación y Cobranzas

### 8. Facturación por Lotes (Billing Batch)

```mermaid
sequenceDiagram
    participant Cron
    participant Batch as Batch CLI
    participant AdjustmentSvc as AdjustmentService
    participant BCRA as BCRA API
    participant ExchangeSvc as ExchangeRateService
    participant BillingSvc as BillingService
    participant ArcaSvc as ArcaService
    participant ARCA
    participant DB
    participant WhatsApp

    Cron->>Batch: billing --date today
    Batch->>DB: Buscar contratos con facturación hoy
    DB-->>Batch: Lista de leases activos
    
    loop Para cada contrato
        alt Ajuste por índice habilitado
            Batch->>AdjustmentSvc: calculateAdjustedRent(lease)
            AdjustmentSvc->>BCRA: GET /datosvariable/41 (ICL)
            BCRA-->>AdjustmentSvc: Valor índice actual
            AdjustmentSvc-->>Batch: Monto ajustado
        end
        
        alt Contrato en USD/BRL
            Batch->>ExchangeSvc: getRate(USD, ARS)
            ExchangeSvc->>BCRA: GET /datosvariable/4
            BCRA-->>ExchangeSvc: Tipo de cambio
            ExchangeSvc-->>Batch: Rate
        end
        
        Batch->>BillingSvc: generateInvoice(lease, date)
        BillingSvc->>DB: CREATE Invoice
        
        alt ARCA habilitado
            BillingSvc->>ArcaSvc: emitInvoice(invoice)
            ArcaSvc->>ARCA: LoginCMS + FECAESolicitar
            ARCA-->>ArcaSvc: CAE + Nro Comprobante
            ArcaSvc->>DB: UPDATE Invoice (CAE, QR)
        end
        
        BillingSvc->>WhatsApp: Enviar factura al tenant
    end
    
    Batch->>DB: Registrar BillingJob (auditoría)
```

### 9. Procesamiento de Pago (MercadoPago)

```mermaid
sequenceDiagram
    participant Tenant
    participant Frontend
    participant Backend
    participant MP as MercadoPago
    participant DB
    participant PaymentSvc as PaymentService
    participant ReceiptSvc as ReceiptService
    participant SettlementSvc as SettlementService
    participant WhatsApp

    Tenant->>Frontend: Click "Pagar"
    Frontend->>Backend: POST /payments/mercadopago/preference
    Backend->>MP: Create preference
    MP-->>Backend: Preference ID + init_point
    Backend-->>Frontend: Redirect URL
    Frontend->>MP: Redirect a checkout
    
    Tenant->>MP: Completa pago
    MP->>Backend: Webhook (payment.approved)
    Backend->>PaymentSvc: confirmPayment(paymentId)
    PaymentSvc->>DB: UPDATE Payment (status=confirmed)
    
    PaymentSvc->>DB: UPDATE TenantAccount (aplicar pago)
    
    PaymentSvc->>ReceiptSvc: generate(payment)
    ReceiptSvc->>DB: CREATE Receipt
    ReceiptSvc->>WhatsApp: Enviar recibo PDF
    
    PaymentSvc->>SettlementSvc: scheduleForPayment(payment)
    SettlementSvc->>DB: CREATE Settlement (status=scheduled)
```

### 10. Procesamiento de Pago Crypto

```mermaid
sequenceDiagram
    participant Tenant
    participant Frontend
    participant Backend
    participant CryptoSvc as CryptoPaymentService
    participant Blockchain
    participant DB
    participant PaymentSvc as PaymentService
    participant WhatsApp

    Tenant->>Frontend: Seleccionar pago crypto
    Frontend->>Backend: POST /payments/crypto/address
    
    alt Bitcoin
        Backend->>CryptoSvc: generateBitcoinAddress(invoiceId)
        CryptoSvc->>DB: Derivar address HD desde xpub
        CryptoSvc-->>Backend: BTC Address único
    else Lightning
        Backend->>CryptoSvc: generateLightningInvoice(invoiceId)
        CryptoSvc->>DB: CREATE LightningInvoice
        CryptoSvc-->>Backend: Invoice (lnbc...)
    else Ethereum/Polygon
        Backend->>CryptoSvc: getSmartContractPaymentData(invoiceId)
        CryptoSvc-->>Backend: Contract address + data
    end
    
    Backend-->>Frontend: Payment info (address/invoice/QR)
    Frontend->>Tenant: Mostrar QR / address
    
    Tenant->>Blockchain: Envía transacción
    
    Note over Blockchain,Backend: Batch job cada 5 min
    
    Backend->>CryptoSvc: checkPendingPayments()
    CryptoSvc->>Blockchain: Query confirmaciones
    
    alt Confirmaciones >= threshold
        Blockchain-->>CryptoSvc: Confirmado
        CryptoSvc->>PaymentSvc: confirmPayment(paymentId)
        PaymentSvc->>WhatsApp: Enviar recibo
    else Pendiente
        Blockchain-->>CryptoSvc: Esperando confirmaciones
    end
```

### 11. Conciliación Bancaria

```mermaid
sequenceDiagram
    participant Cron
    participant Batch as Batch CLI
    participant ReconSvc as ReconciliationService
    participant BankAPI as API Banco (Bind)
    participant DB
    participant PaymentSvc as PaymentService
    participant Slack

    Cron->>Batch: reconcile-bank
    Batch->>DB: Obtener cuentas bancarias activas
    
    loop Para cada cuenta
        Batch->>ReconSvc: reconcileBankMovements(accountId)
        ReconSvc->>BankAPI: GET /movements (last 24h)
        BankAPI-->>ReconSvc: Lista de movimientos
        
        loop Para cada movimiento
            ReconSvc->>DB: Buscar alias en descripción
            
            alt Alias encontrado
                ReconSvc->>DB: Buscar factura pendiente de propiedad
                alt Factura encontrada
                    ReconSvc->>PaymentSvc: confirmPayment()
                    ReconSvc->>DB: CREATE BankReconciliation (matched)
                else No encontrada
                    ReconSvc->>DB: CREATE BankReconciliation (unmatched)
                    ReconSvc->>Slack: Alerta: movimiento sin factura
                end
            else Sin alias
                ReconSvc->>DB: Buscar por monto exacto + fecha
                alt Match único
                    ReconSvc->>PaymentSvc: confirmPayment()
                else Sin match / múltiples
                    ReconSvc->>DB: CREATE BankReconciliation (unmatched)
                    ReconSvc->>Slack: Alerta: requiere revisión manual
                end
            end
        end
    end
```

### 12. Liquidación a Propietarios

```mermaid
sequenceDiagram
    participant Cron
    participant Batch as Batch CLI
    participant SettlementSvc as SettlementService
    participant DB
    participant BankAPI as API Banco
    participant CryptoSvc as CryptoPaymentService
    participant Blockchain
    participant WhatsApp
    participant Owner

    Cron->>Batch: process-settlements
    Batch->>SettlementSvc: processScheduledSettlements()
    SettlementSvc->>DB: SELECT settlements WHERE status=scheduled AND date<=today
    DB-->>SettlementSvc: Lista de liquidaciones pendientes
    
    loop Para cada liquidación
        SettlementSvc->>DB: UPDATE status = 'processing'
        
        alt Método: Transferencia bancaria
            SettlementSvc->>DB: Obtener bank_account del owner
            SettlementSvc->>BankAPI: POST /transfers
            BankAPI-->>SettlementSvc: tx_reference
        else Método: Crypto
            SettlementSvc->>CryptoSvc: transferToOwner(settlement)
            CryptoSvc->>Blockchain: Send transaction
            Blockchain-->>CryptoSvc: tx_hash
        end
        
        SettlementSvc->>DB: UPDATE status='completed', tx_reference
        SettlementSvc->>WhatsApp: sendSettlementCompleted(settlement)
        WhatsApp->>Owner: WhatsApp con detalle de liquidación
    end
```

### 13. Sincronización de Índices de Inflación

```mermaid
sequenceDiagram
    participant Cron
    participant Batch as Batch CLI
    participant BcraSvc as BcraService
    participant FgvSvc as FgvService
    participant BCRA as BCRA API
    participant BCB as BCB API
    participant DB

    Cron->>Batch: sync-indices
    
    par Argentina (ICL)
        Batch->>BcraSvc: getICL(fromDate, toDate)
        BcraSvc->>BCRA: GET /datosvariable/41/{from}/{to}
        BCRA-->>BcraSvc: Valores ICL
        BcraSvc->>DB: UPSERT inflation_indices (ICL)
    and Brasil (IGP-M)
        Batch->>FgvSvc: getIGPM(fromDate, toDate)
        FgvSvc->>BCB: GET /dados/serie/bcdata.sgs.189/dados
        BCB-->>FgvSvc: Valores IGP-M
        FgvSvc->>DB: UPSERT inflation_indices (IGP-M)
    and Tipos de cambio
        Batch->>BcraSvc: getExchangeRate(USD, today)
        BcraSvc->>BCRA: GET /datosvariable/4
        BCRA-->>BcraSvc: USD/ARS
        BcraSvc->>DB: UPSERT exchange_rates
        
        Batch->>BcraSvc: getExchangeRate(BRL, today)
        BcraSvc->>BCRA: GET /datosvariable/12
        BCRA-->>BcraSvc: BRL/ARS
        BcraSvc->>DB: UPSERT exchange_rates
    end
    
    Batch->>DB: Registrar BillingJob (sync-indices)
```

### 14. Recordatorios y Mora

```mermaid
sequenceDiagram
    participant Cron
    participant Batch as Batch CLI
    participant DB
    participant WhatsApp
    participant Tenant

    Note over Cron,Batch: Recordatorios (3 días antes)
    Cron->>Batch: reminders --days 3
    Batch->>DB: SELECT invoices WHERE due_date = today + 3 AND status = 'pending'
    DB-->>Batch: Lista de facturas próximas a vencer
    
    loop Para cada factura
        Batch->>WhatsApp: send(whatsapp-payment-reminder)
        WhatsApp->>Tenant: Recordatorio de pago
        Batch->>DB: UPDATE notification_sent = true
    end
    
    Note over Cron,Batch: Marcar vencidas
    Cron->>Batch: overdue
    Batch->>DB: UPDATE invoices SET status='overdue' WHERE due_date < today AND status='pending'
    
    loop Para cada factura vencida
        Batch->>WhatsApp: send(whatsapp-overdue-notice)
        WhatsApp->>Tenant: Aviso de mora
    end
    
    Note over Cron,Batch: Intereses por mora
    Cron->>Batch: late-fees
    Batch->>DB: SELECT overdue invoices
    
    loop Para cada factura en mora
        Batch->>Batch: Calcular interés (días * tasa)
        Batch->>DB: CREATE Invoice (late_fee)
        Batch->>DB: UPDATE tenant_account (agregar cargo)
    end
```

