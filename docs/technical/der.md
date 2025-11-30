# Modelo de Datos (ERD)

Esquema conceptual de las entidades principales y sus relaciones, organizado por dominio funcional.

## 1. Dominio Core: Usuarios y Autenticación

```mermaid
erDiagram
    %% Auth Service Models
    USER ||--o| OWNER : is
    USER ||--o| TENANT : is
    USER ||--o| STAFF : is
    USER ||--o| ADMIN : is
    USER {
        uuid id
        string email
        string password_hash
        string role
        boolean is_active
        datetime last_login
        datetime created_at
    }

    %% Organization
    COMPANY ||--|{ STAFF : employs
    COMPANY {
        uuid id
        string name
        string tax_id
        string plan_type
        json settings
    }

    OWNER {
        uuid user_id
        string tax_id
        string bank_account
    }

    TENANT {
        uuid user_id
        string dni
        string emergency_contact
    }

    STAFF {
        uuid user_id
        uuid company_id
        string specialization
    }

    ADMIN {
        uuid user_id
        json permissions
    }
```

## 2. Dominio de Propiedades

```mermaid
erDiagram
    COMPANY ||--|{ PROPERTY : manages
    OWNER ||--|{ PROPERTY : owns
    PROPERTY ||--|{ UNIT : contains
    PROPERTY ||--|{ PROPERTY_FEATURE : has
    PROPERTY ||--|{ DOCUMENT : has

    COMPANY {
        uuid id
        string name
    }

    OWNER {
        uuid user_id
    }

    PROPERTY {
        uuid id
        uuid company_id
        uuid owner_id
        string address
        string city
        string state
        string zip_code
        float geo_lat
        float geo_long
        string type
        string status
        datetime created_at
    }

    PROPERTY_FEATURE {
        uuid id
        uuid property_id
        string name
        string value
    }

    UNIT {
        uuid id
        uuid property_id
        string unit_number
        int floor
        int bedrooms
        int bathrooms
        float area_sqm
        string status
    }

    DOCUMENT {
        uuid id
        string entity_type
        uuid entity_id
        string doc_type
        string s3_key
        string mime_type
        int file_size
        string status
        datetime uploaded_at
    }
```

## 3. Dominio de Contratos (Leases)

```mermaid
erDiagram
    TENANT ||--|{ LEASE : signs
    UNIT ||--|{ LEASE : has
    LEASE ||--|{ LEASE_AMENDMENT : history
    LEASE ||--|{ DOCUMENT : has

    TENANT {
        uuid user_id
        string dni
    }

    UNIT {
        uuid id
        string unit_number
    }

    LEASE {
        uuid id
        uuid unit_id
        uuid tenant_id
        date start_date
        date end_date
        decimal rent_amount
        string currency
        decimal deposit
        string payment_frequency
        string status
        string renewal_terms
    }

    LEASE_AMENDMENT {
        uuid id
        uuid lease_id
        date effective_date
        string change_type
        json old_values
        json new_values
        string status
    }

    DOCUMENT {
        uuid id
        string entity_type
        uuid entity_id
        string doc_type
        string s3_key
    }
```

## 4. Dominio Financiero (Payments & Invoicing)

```mermaid
erDiagram
    LEASE ||--|{ PAYMENT : generates
    PAYMENT ||--o| INVOICE : generates

    LEASE {
        uuid id
        decimal rent_amount
        string currency
    }

    PAYMENT {
        uuid id
        uuid lease_id
        decimal amount
        string currency
        date payment_date
        string method
        string status
        string transaction_ref
        string failure_reason
    }

    INVOICE {
        uuid id
        uuid payment_id
        string invoice_number
        decimal subtotal
        decimal tax_amount
        decimal total
        string pdf_url
        date issued_at
        string status
    }
```

## 5. Dominio de Operaciones (Maintenance)

```mermaid
erDiagram
    TENANT ||--|{ MAINTENANCE_TICKET : requests
    STAFF ||--|{ MAINTENANCE_TICKET : assigned_to
    UNIT ||--|{ MAINTENANCE_TICKET : reports

    TENANT {
        uuid user_id
        string dni
    }

    STAFF {
        uuid user_id
        string specialization
    }

    UNIT {
        uuid id
        string unit_number
    }

    MAINTENANCE_TICKET {
        uuid id
        uuid unit_id
        uuid tenant_id
        uuid staff_id
        string title
        string description
        string priority
        string status
        decimal cost_estimate
        datetime created_at
        datetime resolved_at
    }
```

## 6. Dominio de Sistema (CRM, Reports, Logs)

```mermaid
erDiagram
    %% CRM
    USER ||--|{ LEAD : manages
    LEAD ||--|{ LEAD_ACTIVITY : has

    USER {
        uuid id
        string email
        string role
    }

    LEAD {
        uuid id
        uuid assigned_to
        string name
        string email
        string phone
        string status
        string source
        json requirements
        datetime created_at
        datetime last_contact
    }

    LEAD_ACTIVITY {
        uuid id
        uuid lead_id
        uuid user_id
        string activity_type
        text notes
        datetime activity_date
    }

    %% Reports
    USER ||--|{ REPORT_TEMPLATE : creates
    USER ||--|{ REPORT_EXECUTION : requests

    REPORT_TEMPLATE {
        uuid id
        string name
        string type
        json filters
        json columns
        boolean is_public
        datetime created_at
    }

    REPORT_EXECUTION {
        uuid id
        uuid template_id
        uuid user_id
        string status
        string file_url
        json parameters
        datetime requested_at
        datetime completed_at
    }

    %% Logs
    USER ||--|{ NOTIFICATION_LOG : receives
    USER ||--|{ AUDIT_LOG : performs

    NOTIFICATION_LOG {
        uuid id
        uuid user_id
        string type
        string channel
        string status
        datetime sent_at
    }

    AUDIT_LOG {
        uuid id
        uuid user_id
        string entity_type
        uuid entity_id
        string action
        json changes
        datetime timestamp
    }
```

## 7. Vista Consolidada de Relaciones Principales

```mermaid
erDiagram
    COMPANY ||--|{ PROPERTY : manages
    OWNER ||--|{ PROPERTY : owns
    PROPERTY ||--|{ UNIT : contains
    UNIT ||--|{ LEASE : has
    TENANT ||--|{ LEASE : signs
    LEASE ||--|{ PAYMENT : generates
    PAYMENT ||--o| INVOICE : generates
    UNIT ||--|{ MAINTENANCE_TICKET : reports
    TENANT ||--|{ MAINTENANCE_TICKET : requests
    STAFF ||--|{ MAINTENANCE_TICKET : assigned_to
    USER ||--|{ LEAD : manages
    USER ||--|{ REPORT_EXECUTION : requests

    COMPANY {
        uuid id
        string name
    }

    OWNER {
        uuid user_id
    }

    PROPERTY {
        uuid id
        string address
        string status
    }

    UNIT {
        uuid id
        string unit_number
        string status
    }

    TENANT {
        uuid user_id
        string dni
    }

    LEASE {
        uuid id
        date start_date
        date end_date
        string status
    }

    PAYMENT {
        uuid id
        decimal amount
        string status
    }

    INVOICE {
        uuid id
        string invoice_number
    }

    MAINTENANCE_TICKET {
        uuid id
        string status
    }

    STAFF {
        uuid user_id
    }

    USER {
        uuid id
        string email
        string role
    }

    LEAD {
        uuid id
        string status
    }

    REPORT_EXECUTION {
        uuid id
        string status
    }
```

