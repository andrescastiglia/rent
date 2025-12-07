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

## 4. Dominio Financiero (Billing, Payments & Invoicing)

### 4.1 Facturación e Índices

```mermaid
erDiagram
    LEASE ||--|{ INVOICE : generates
    INVOICE ||--o{ PAYMENT : receives
    COMPANY ||--o| ARCA_CONFIG : has

    LEASE {
        uuid id
        decimal rent_amount
        string currency_code
        boolean adjustment_enabled
        string adjustment_index
        string adjustment_frequency
        integer adjustment_month
        date last_adjustment_date
        decimal last_adjustment_value
        boolean increase_clause_enabled
        string increase_clause_type
        decimal increase_clause_value
        boolean auto_billing_enabled
        boolean arca_enabled
        string arca_invoice_type
    }

    INVOICE {
        uuid id
        uuid lease_id
        string invoice_number
        decimal original_amount
        decimal subtotal
        decimal tax_amount
        decimal total
        string currency_code
        decimal exchange_rate
        decimal amount_in_original_currency
        boolean adjustment_applied
        string adjustment_index
        decimal adjustment_value
        decimal retention_iibb
        decimal retention_iva
        decimal retention_ganancias
        decimal net_amount
        boolean arca_enabled
        string arca_cae
        date arca_cae_expiry
        string arca_invoice_type
        integer arca_point_of_sale
        integer arca_receipt_number
        text arca_qr_data
        string status
        date due_date
        date issued_at
    }

    ARCA_CONFIG {
        uuid company_id
        boolean arca_enabled
        string arca_cuit
        integer arca_point_of_sale
        bytea arca_certificate
        bytea arca_private_key
        string arca_environment
    }

    INFLATION_INDEX {
        uuid id
        string index_code
        string country_code
        date period_date
        decimal value
        decimal variation_monthly
        decimal variation_yearly
        string source
        datetime fetched_at
    }

    EXCHANGE_RATE {
        uuid id
        string from_currency
        string to_currency
        decimal rate
        date rate_date
        string source
        datetime fetched_at
    }

    COMPANY ||--o{ INFLATION_INDEX : uses
    COMPANY ||--o{ EXCHANGE_RATE : uses
```

### 4.2 Cobranzas y Cuentas

```mermaid
erDiagram
    COMPANY ||--o{ BANK_ACCOUNT : has
    COMPANY ||--o{ CRYPTO_WALLET : has
    OWNER ||--o{ BANK_ACCOUNT : has
    OWNER ||--o{ CRYPTO_WALLET : has
    PROPERTY ||--o| BANK_ACCOUNT : virtual_alias
    INVOICE ||--o{ PAYMENT : receives
    PAYMENT ||--o| BANK_ACCOUNT : received_in
    PAYMENT ||--o| CRYPTO_WALLET : received_in
    PAYMENT ||--|| RECEIPT : generates
    TENANT ||--|| TENANT_ACCOUNT : has
    TENANT_ACCOUNT ||--|{ TENANT_ACCOUNT_MOVEMENT : records

    BANK_ACCOUNT {
        uuid id
        string owner_type
        uuid owner_id
        string country
        string account_type
        string account_number
        string routing_number
        string alias
        string bank_name
        string holder_name
        string holder_document
        boolean is_virtual
        uuid parent_account_id
        boolean is_active
        datetime verified_at
    }

    CRYPTO_WALLET {
        uuid id
        string owner_type
        uuid owner_id
        string network
        string xpub
        string derivation_path
        string lightning_node_pubkey
        string smart_contract_address
        string current_address
        string label
        string wallet_type
        decimal balance_cached
        datetime balance_updated_at
        boolean is_active
    }

    LIGHTNING_INVOICE {
        uuid id
        uuid crypto_wallet_id
        uuid payment_id
        string invoice_hash
        text invoice_string
        bigint amount_sats
        string description
        datetime expires_at
        string status
        datetime paid_at
    }

    PAYMENT {
        uuid id
        uuid invoice_id
        uuid tenant_account_id
        string payment_method
        string payment_provider
        string external_id
        decimal amount
        string currency
        string status
        datetime received_at
        uuid bank_account_id
        uuid crypto_wallet_id
        string tx_hash
        integer confirmation_count
        json metadata
    }

    RECEIPT {
        uuid id
        uuid payment_id
        string receipt_number
        uuid tenant_id
        decimal amount
        string currency
        datetime issued_at
        string pdf_url
        datetime sent_at
    }

    TENANT_ACCOUNT {
        uuid id
        uuid lease_id
        uuid tenant_id
        decimal balance
        datetime last_movement_at
    }

    TENANT_ACCOUNT_MOVEMENT {
        uuid id
        uuid tenant_account_id
        string movement_type
        uuid reference_id
        decimal amount
        decimal balance_after
        string description
    }
```

### 4.3 Liquidaciones y Conciliación

```mermaid
erDiagram
    OWNER ||--o{ SETTLEMENT : receives
    SETTLEMENT ||--|{ SETTLEMENT_ITEM : contains
    SETTLEMENT ||--o| BANK_ACCOUNT : paid_to
    SETTLEMENT ||--o| CRYPTO_WALLET : paid_to
    BANK_ACCOUNT ||--|{ BANK_RECONCILIATION : has

    SETTLEMENT {
        uuid id
        uuid owner_id
        uuid contract_id
        date period_start
        date period_end
        decimal gross_amount
        decimal commission_amount
        string commission_type
        decimal commission_rate
        decimal withholdings_amount
        decimal net_amount
        string currency
        string status
        date scheduled_date
        datetime processed_at
        string payment_method
        uuid bank_account_id
        uuid crypto_wallet_id
        string tx_reference
    }

    SETTLEMENT_ITEM {
        uuid id
        uuid settlement_id
        uuid invoice_id
        uuid payment_id
        decimal amount
        date payment_date
        date due_date
    }

    BANK_RECONCILIATION {
        uuid id
        uuid bank_account_id
        string external_reference
        decimal amount
        string currency
        date transaction_date
        text description
        uuid matched_payment_id
        string status
    }
```

### 4.4 Auditoría de Procesos Batch

```mermaid
erDiagram
    BILLING_JOB {
        uuid id
        string job_type
        string status
        datetime started_at
        datetime completed_at
        integer records_processed
        integer records_success
        integer records_failed
        text error_message
        json details
    }

    REPORT_SCHEDULE ||--|{ REPORT_EXECUTION : generates

    REPORT_SCHEDULE {
        uuid id
        string report_type
        string frequency
        string recipient_type
        uuid recipient_id
        boolean enabled
        datetime last_run_at
        datetime next_run_at
    }

    REPORT_EXECUTION {
        uuid id
        uuid schedule_id
        string report_type
        string status
        date period_start
        date period_end
        string recipient_email
        text file_path
        datetime sent_at
        text error_message
    }

    NOTIFICATION_PREFERENCE {
        uuid id
        uuid user_id
        boolean invoice_issued
        boolean payment_received
        boolean payment_reminder
        boolean overdue_notice
        boolean late_fee_applied
        boolean adjustment_applied
        boolean email_enabled
        integer reminder_days_before
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
    COMPANY ||--o{ BANK_ACCOUNT : has
    OWNER ||--|{ PROPERTY : owns
    OWNER ||--o{ BANK_ACCOUNT : has
    OWNER ||--o{ SETTLEMENT : receives
    PROPERTY ||--|{ UNIT : contains
    PROPERTY ||--o| BANK_ACCOUNT : virtual_alias
    UNIT ||--|{ LEASE : has
    TENANT ||--|{ LEASE : signs
    TENANT ||--|| TENANT_ACCOUNT : has
    LEASE ||--|{ INVOICE : generates
    INVOICE ||--o{ PAYMENT : receives
    PAYMENT ||--|| RECEIPT : generates
    PAYMENT ||--o| BANK_ACCOUNT : received_in
    UNIT ||--|{ MAINTENANCE_TICKET : reports
    TENANT ||--|{ MAINTENANCE_TICKET : requests
    STAFF ||--|{ MAINTENANCE_TICKET : assigned_to
    USER ||--|{ LEAD : manages
    USER ||--|{ REPORT_EXECUTION : requests

    COMPANY {
        uuid id
        string name
        boolean arca_enabled
        string country_code
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

    TENANT_ACCOUNT {
        uuid id
        decimal balance
    }

    LEASE {
        uuid id
        date start_date
        date end_date
        string status
        string currency_code
        boolean adjustment_enabled
    }

    INVOICE {
        uuid id
        string invoice_number
        decimal total
        string status
        string arca_cae
    }

    PAYMENT {
        uuid id
        decimal amount
        string status
        string payment_method
    }

    RECEIPT {
        uuid id
        string receipt_number
    }

    SETTLEMENT {
        uuid id
        decimal net_amount
        string status
    }

    BANK_ACCOUNT {
        uuid id
        string alias
        string account_type
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

