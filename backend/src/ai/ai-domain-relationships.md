# AI Domain Relationship Map (DB-driven)

Source of truth: TypeORM entities in `backend/src/**/entities/*.entity.ts`.
This document defines how to traverse data relationships using backend tools.

## 1) Canonical identity model

- `users.id`: identity row for login/profile. Role enum: `admin`, `owner`, `tenant`, `staff`.
- `owners.id`: business owner record. Links to user with `owners.user_id -> users.id`.
- `tenants.id`: business tenant record. Links to user with `tenants.user_id -> users.id`.
- `staff.id`: operational staff record. Links to user with `staff.user_id -> users.id`.
- `admins.id`: admin record. Links to user with `admins.user_id -> users.id`. Has `isSuperAdmin` flag and granular `permissions` (CRUD for users, properties, leases, payments, maintenance, reports).

Important:

- `owner.id` is NOT `owner.user_id`.
- `tenant.id` is NOT `tenant.user_id`.
- Some tools use tenant user id (`get_tenant_*`), others can use tenant id (`get_payments(tenantId)`).
- `settlements.owner_id` references `owners.user_id`, NOT `owners.id`.

## 2) Core relational graph

```
Company ──1:N──> User (admin|owner|tenant|staff)
    │
    ├──1:N──> Property ──1:N──> Lease ──1:1──> TenantAccount ──1:N──> Movement
    │             │                │                │
    │             │                │                ├──1:N──> Payment ──1:1──> Receipt
    │             │                │                └──1:N──> Invoice ──1:N──> CreditNote
    │             │                │
    │             │                ├──1:N──> Amendment
    │             │                └──M:1──> Tenant
    │             │
    │             ├──1:N──> Unit
    │             ├──1:N──> Visit ──1:N──> VisitNotification
    │             ├──1:N──> PropertyImage
    │             ├──1:N──> PropertyFeature
    │             └──M:1──> Owner ──1:N──> Settlement
    │
    ├──1:N──> InterestedProfile ──converts──> Tenant | SaleAgreement
    │             ├──1:N──> InterestedActivity
    │             ├──1:N──> InterestedStageHistory
    │             ├──1:N──> InterestedPropertyMatch
    │             └──1:N──> PropertyReservation
    │
    ├──1:N──> SaleFolder ──1:N──> SaleAgreement ──1:N──> SaleReceipt
    │
    ├──1:N──> Document (polymorphic: entityType + entityId)
    ├──1:N──> CommissionInvoice (per owner, per period)
    ├──1:N──> LeaseContractTemplate (per contract type)
    ├──1:N──> PaymentDocumentTemplate (receipt|invoice|credit_note)
    └──1:N──> BillingJob (batch automation)

Currency ──1:N──> ExchangeRate (daily pairs)
InflationIndex (ICL/IPC/IGP-M, monthly values)
```

### Owner portfolio chain

- `owners.id`
  -> `properties.owner_id`
  -> `leases.owner_id`
  -> `invoices.owner_id`

Supporting links:

- `properties.id` -> `leases.property_id`
- `leases.id` -> `invoices.lease_id`
- `leases.id` -> `tenant_accounts.lease_id`
- `tenant_accounts.id` -> `payments.tenant_account_id`
- `owners.user_id` -> `settlements.owner_id` (note: user_id, not owner.id)
- `owners.id` -> `commission_invoices.owner_id`

### Tenant portfolio chain

- `tenants.id`
  -> `leases.tenant_id`
  -> `tenant_accounts.tenant_id`
  -> `payments.tenant_id`

Supporting links:

- `leases.property_id` -> `properties.id`
- `leases.id` -> `invoices.lease_id`
- `tenant_accounts.id` -> `invoices.tenant_account_id`
- `tenant_accounts.id` -> `payments.tenant_account_id`

### Property activity chain

- `properties.id`
  -> `property_visits.property_id`
  -> `property_visit_notifications.visit_id`
  -> `property_images.property_id`
  -> `units.property_id`

### CRM pipeline chain

- `interested_profiles.id`
  -> `interested_activities.interested_profile_id`
  -> `interested_stage_history.interested_profile_id`
  -> `interested_property_matches.interested_profile_id` -> `properties.id`
  -> `property_reservations.interested_profile_id` -> `properties.id`
  -> (converts to) `tenants.id` or `sale_agreements.id`

### Sales chain

- `sale_folders.id` -> `sale_agreements.folder_id` -> `sale_receipts.agreement_id`

### Activity systems (parallel structure)

- `owner_activities.owner_id` (optional `owner_activities.property_id`)
- `tenant_activities.tenant_id`
- `interested_activities.interested_profile_id`

All three share types: `call`, `task`, `note`, `email`, `whatsapp`, `visit` (owner also has `reserve`).
All three share statuses: `pending`, `completed`, `cancelled`.

### Document associations (polymorphic)

- `documents.entity_type` + `documents.entity_id` -> any entity.
- Common entity types: `property`, `unit`, `lease`, `owner_settlement`.
- Document types: `lease_contract`, `id_document`, `proof_of_income`, `bank_statement`, `utility_bill`, `insurance`, `inspection_report`, `maintenance_record`, `photo`, `other`.

## 3) Entity lifecycles and state machines

### Lease lifecycle

```
DRAFT ──confirm/activate──> ACTIVE ──terminate/finalize──> FINALIZED
  │                           │
  │                           └──renew──> new DRAFT (with previousLeaseId link)
  └──(editable, deletable)
```

- `draft`: initial state. Editable, deletable. Contract text can be rendered from template.
- `active`: signed contract. Not editable. Only one active rental lease per property at a time. Confirming auto-finalizes any existing active lease on same property.
- `finalized`: ended contract (terminated or completed).
- Confirm/activate sets property `operationState` to `rented` (rental) or `sold` (sale). Creates `TenantAccount` for rentals.
- Terminate/finalize sets property `operationState` back to `available` (rental only).
- Renewal creates a new DRAFT lease with `previousLeaseId` link and incremented `versionNumber`.
- Contract types: `rental`, `sale`.
- Payment frequencies: `monthly`, `bimonthly`, `quarterly`, `semiannual`, `annual`.
- Billing frequencies: `first_of_month`, `last_of_month`, `contract_date`, `custom`.

### Invoice lifecycle

```
DRAFT ──issue──> PENDING ──> SENT ──> PARTIAL ──> PAID
                   │           │        │
                   │           │        └──> OVERDUE
                   │           └──> OVERDUE
                   └──> OVERDUE
Any non-PAID ──cancel──> CANCELLED
```

- `issue()` sets `issuedAt`, creates CHARGE movement in tenant account, creates commission invoice for owner.
- Partial: when `amountPaid < total` after a payment.
- Paid: when `amountPaid >= total` after a payment.
- Overdue: set by batch job when due date passes.
- Cancel: reverses the charge with ADJUSTMENT movement. PAID invoices cannot be cancelled.

### Payment lifecycle

```
PENDING ──confirm──> COMPLETED
PENDING ──cancel──> CANCELLED
COMPLETED ──cancel──> CANCELLED (with reversal)
```

- `confirm()`: creates PAYMENT movement in tenant account (reduces debt). Applies payment to invoices in FIFO order (by `dueDate`). Generates receipt + PDF. Auto-creates credit notes for late fees on fully settled invoices.
- Cancel of COMPLETED payment: creates ADJUSTMENT reversal movement (re-adds debt).
- Payment methods: `cash`, `bank_transfer`, `credit_card`, `debit_card`, `check`, `digital_wallet`, `crypto`, `other`.

### Amendment lifecycle

```
DRAFT ──> PENDING_APPROVAL ──approve──> APPROVED
                            ──reject──> REJECTED
```

- Only for ACTIVE leases.
- Change types: `rent_increase`, `rent_decrease`, `extension`, `early_termination`, `clause_modification`, `guarantor_change`, `other`.
- Stores `previousValues` and `newValues` as JSON for audit trail.

### Interested profile pipeline

```
INTERESTED ──convertToTenant──> TENANT (creates User + Tenant records)
INTERESTED ──convertToBuyer──> BUYER (creates SaleAgreement)
```

- Qualification levels: `mql` (Marketing Qualified Lead), `sql` (Sales Qualified Lead), `rejected`.
- Conversion is one-way and irreversible.
- Operations: `rent`, `sale` (a profile can have multiple).
- Property type preferences: `apartment`, `house`, `commercial`, `office`, `warehouse`, `land`, `parking`, `other`.

### Property match pipeline

```
SUGGESTED ──> CONTACTED ──> VISIT_SCHEDULED ──> ACCEPTED
                                             ──> REJECTED
                                             ──> EXPIRED
```

- Matches have `score` (decimal) and `matchReasons` (text array).
- Auto-generated by matching interested profile preferences against property attributes.

### Property reservation

```
ACTIVE ──> RELEASED
ACTIVE ──> CONVERTED
```

### Property states

- Status: `active`, `inactive`, `under_maintenance`, `pending_approval`.
- Operation state: `available`, `rented`, `reserved`, `sold` (auto-synced by lease lifecycle).
- Operations: `rent`, `sale` (array, a property can support both).
- Types: `apartment`, `house`, `commercial`, `office`, `warehouse`, `land`, `parking`, `other`.

### Settlement lifecycle

```
pending ──> processing ──> completed
                       ──> failed
```

- One settlement per owner per period (format `YYYY-MM`).
- `net_amount = gross_amount - commission_amount - withholdings_amount`.
- Payment must match `net_amount` exactly.

### Document lifecycle

```
PENDING ──> APPROVED
PENDING ──> REJECTED
APPROVED ──> EXPIRED (when expiresAt passes)
```

### Credit note lifecycle

```
DRAFT ──> ISSUED ──> CANCELLED
```

- Auto-created when payment settles an invoice that had late fees.
- Creates DISCOUNT movement in tenant account.

## 4) Tenant account (cuenta corriente) system

The tenant account is the double-entry ledger for each tenant-lease pair:

- One `TenantAccount` per lease (1:1 relationship). Auto-created when lease is confirmed (rental only).
- `balance` field: positive = debt (tenant owes), negative = credit (overpaid).
- Movement types and their effect on balance:
  - `charge` (+): when invoice is issued.
  - `payment` (-): when payment is confirmed.
  - `adjustment` (+/-): reversals — cancelled invoices add negative adjustment, cancelled payments add positive adjustment.
  - `refund` (-): refund to tenant.
  - `interest` (+): interest charges.
  - `late_fee` (+): late payment fees.
  - `discount` (-): credit notes, discounts.
- Each movement records `referenceType` + `referenceId` for tracing back to source (invoice, payment, credit_note).
- Tools: `get_tenant_account_by_lease`, `get_tenant_account_by_id`, `get_tenant_account_movements`, `get_tenant_account_balance`.

## 5) Lease pricing and adjustments

### Late fees

- `lateFeeType`: `none`, `fixed`, `percentage`, `daily_fixed`, `daily_percentage`.
  - `fixed`: flat amount charged once after grace period.
  - `percentage`: percentage of monthly rent charged once.
  - `daily_fixed`: flat amount per day overdue.
  - `daily_percentage`: percentage per day overdue.
- `lateFeeGraceDays`: days after due date before late fee applies.
- `lateFeeMax`: maximum late fee cap.

### Rent adjustments

- `adjustmentType`: `fixed`, `percentage`, `inflation_index`.
  - `fixed`: add/subtract a fixed amount.
  - `percentage`: multiply rent by a percentage.
  - `inflation_index`: adjust based on Argentine index (ICL/IPC/IGP-M).
- `adjustmentFrequencyMonths`: how often adjustments occur.
- Tracked via `lastAdjustmentDate` / `nextAdjustmentDate`.

### Increase clauses

- `increaseClauseType`: `none`, `annual_fixed`, `annual_percentage`, `inflation_linked`, `custom_schedule`.
  - `annual_fixed`: fixed amount increase per year.
  - `annual_percentage`: percentage increase per year.
  - `inflation_linked`: tied to Argentine inflation indices.
  - `custom_schedule`: manual schedule stored in `increaseClauseSchedule` (jsonb).

### Inflation indices

- Types: `icl` (Índice para Contratos de Locación), `ipc` (Índice de Precios al Consumidor), `igp_m`.
- Stored monthly with `value`, `variationMonthly`, `variationYearly`.
- Synced by batch job (`sync_indices`).

## 6) Multi-currency support

- `Currency` entity: ISO 4217 codes (`ARS`, `USD`, etc.) with symbol and decimal places.
- `ExchangeRate`: daily rate pairs with source tracking (`rateDate`, `source`, `sourceUrl`).
- Invoices support multi-currency: `originalAmount`/`originalCurrency`/`exchangeRateUsed`/`exchangeRateDate`.
- Leases link to currency via `currency` column referencing `currencies.code`.
- Default currency resolved by locale via `get_currencies_default_for_locale`.
- Exchange rates synced by batch job (`exchange_rates`).

## 7) Sales module

- `SaleFolder`: organizational container. Fields: `name`, `description`.
- `SaleAgreement`: buyer contract within a folder. Fields: `buyerName`, `buyerPhone`, `totalAmount`, `currency`, `installmentAmount`, `installmentCount`, `startDate`, `dueDay`, `paidAmount`, `notes`.
- `SaleReceipt`: individual installment record. Fields: `receiptNumber`, `installmentNumber`, `amount`, `paymentDate`, `balanceAfter`, `overdueAmount`, `copyCount`, `pdfUrl`.
- Traversal: `get_sales_folders` -> `get_sales_agreements({ folderId })` -> `get_sales_agreement_receipts({ id })`.
- PDF generation: `get_sales_receipt_pdf({ receiptId })`.

## 8) ARCA integration (Argentine tax authority)

- Company-level configuration: CUIT, razón social, IVA condition, punto de venta, digital certificates.
- Invoice-level: CAE (Código de Autorización Electrónico), tipo de comprobante (factura/nota_credito/nota_debito/recibo A/B/C), QR data.
- Withholding agent flags: IIBB (ingresos brutos), Ganancias, with configurable rates (jsonb).
- Used when issuing invoices for tax compliance.

## 9) Batch automation (billing jobs)

Job types:
- `billing`: generate periodic invoices for active leases.
- `overdue`: mark invoices past due date as overdue.
- `reminders`: send payment reminders.
- `late_fees`: apply late fees to overdue invoices.
- `sync_indices`: sync Argentine inflation indices (ICL/IPC/IGP-M).
- `reports`: generate reports.
- `exchange_rates`: update daily exchange rates.
- `process_settlements`: calculate and create owner settlement records.

Job statuses: `pending`, `running`, `completed`, `failed`, `partial_failure`.
Tracks: `recordsTotal`, `recordsProcessed`, `recordsFailed`, `recordsSkipped`, `durationMs`.
Tools: `get_dashboard_reports` lists recent job executions.

## 10) Contract and document templates

### Lease contract templates

- Per-company, per-contract-type (`rental` or `sale`).
- `templateBody`: mustache-style text with variable placeholders.
- Rendered via `post_lease_draft_render` during lease draft creation.
- Tools: `get_lease_templates`, `post_lease_templates`, `patch_lease_template_by_id`.

### Payment document templates

- Per-company. Types: `receipt`, `invoice`, `credit_note`.
- Supports `isDefault` flag (one default per type per company).
- Used by PDF generation for receipts and invoices.
- Tools: `get_payment_templates`, `post_payment_templates`, `patch_payment_template_by_id`.

## 11) WhatsApp integration

- Uses Meta/Facebook Graph API (v22.0).
- Sends text messages and document (PDF) messages.
- Supports webhook verification and payload processing.
- Document access: HMAC-signed URLs with configurable TTL.
- Used for: visit notifications to owners, invoice/receipt delivery.
- Can be disabled via environment configuration.
- Tools: `post_whatsapp_messages`, `post_whatsapp_messages_internal`, `get_whatsapp_document_by_id`.

## 12) Dashboard and reporting

`get_dashboard_stats` returns:
- `totalProperties`, `totalTenants`, `activeLeases`.
- `monthlyIncome` (sum of active lease monthly rents), `monthlyExpenses`.
- `currencyCode`, `totalPayments`, `totalInvoices`, `monthlyCommissions`.

`get_dashboard_recent_activity` returns:
- Combined feed of interested activities + owner activities.
- Accepts `limit` filter.

`get_dashboard_reports` returns:
- Batch billing job execution history.
- Useful for checking automation status.

Role-based scoping: owners see only their data; tenants see only their data; admins/staff see all.

## 13) Tool-level traversal rules

### Owner by name -> assigned properties

1. Resolve owner by name using `get_owners`.
2. Match owner through related user fields (`firstName`, `lastName`, `email`).
3. Use exact full-name match first (case-insensitive, accent-insensitive).
4. If 2+ candidates remain, ask clarification and show candidate ids.
5. Fetch properties with `get_properties({ ownerId, page, limit })`.

### Owner -> financial view

From owner id:

- `get_owner_settlements({ id, status, limit })`
- `get_invoices({ ownerId, page, limit })`

Optional drill-down:

- `get_properties({ ownerId })`
- then per property: `get_leases({ propertyId })`
- then per lease: `get_invoices({ leaseId })`, `get_payments({ leaseId })`

### Tenant by name -> contracts, property, payments, invoices, activities

1. Resolve tenant with `get_tenants({ name, page, limit })`.
2. Keep tenant `user.id` and, if available in payload, tenant business `tenant.id`.
3. Use:
   - `get_tenant_leases({ id: tenantUserId })`
   - `get_tenant_activities({ id: tenantUserId })`
4. For payments:
   - try `get_payments({ tenantId: tenantBusinessId })` when tenant id is known,
   - otherwise `get_payments({ tenantId: tenantUserId })` (backend accepts either).
5. For invoices from tenant context:
   - for each lease from step 3: `get_invoices({ leaseId })`.

### Tenant -> account balance and movements

1. From lease id: `get_tenant_account_by_lease({ leaseId })` -> get `tenantAccountId`.
2. `get_tenant_account_balance({ id: tenantAccountId })` -> current balance.
3. `get_tenant_account_movements({ id: tenantAccountId })` -> detailed ledger.

### Property -> tasks/visits/maintenance

- `get_property_visits({ propertyId })`
- `get_property_visit_maintenance_tasks({ propertyId })`

### Interested (CRM) -> full pipeline view

1. Resolve with `get_interested({ name, page, limit })`.
2. Detail: `get_interested_by_id({ id })` -> profile, qualification, operation preferences.
3. Summary: `get_interested_summary({ id })` -> aggregated view.
4. Timeline: `get_interested_timeline({ id })` -> chronological activity feed.
5. Matches: `get_interested_matches({ id })` -> scored property matches.
6. Reservations: `get_interested_reservations({ id })`.
7. Metrics: `get_interested_metrics_overview` -> pipeline-wide stats.
8. Duplicates: `get_interested_duplicates` -> potential duplicate profiles.

### Sales -> folder/agreement/receipt chain

1. List folders: `get_sales_folders`.
2. List agreements: `get_sales_agreements({ folderId, page, limit })`.
3. Agreement detail: `get_sales_agreement_by_id({ id })`.
4. Receipts: `get_sales_agreement_receipts({ id })`.
5. Receipt PDF: `get_sales_receipt_pdf({ receiptId })`.

### Lease -> amendment history

1. From lease id: `get_amendments_by_lease({ leaseId })`.
2. Amendment detail: `get_amendment_by_id({ id })`.

### Property -> units

1. `get_units_by_property({ propertyId })` -> list units.
2. `get_unit_by_id({ id })` -> unit detail with status, area, rent, features.

## 14) Key business rules

1. **One active rental lease per property**: confirming a new lease auto-finalizes the existing one.
2. **Property operation state sync**: confirming rental → `rented`, confirming sale → `sold`, terminating rental → `available`.
3. **Payment FIFO application**: payments are applied to invoices ordered by `dueDate ASC`.
4. **Automatic credit notes**: when payment fully settles an invoice that had late fees, a credit note is auto-generated with DISCOUNT movement.
5. **Tenant account auto-creation**: created when a lease is confirmed (rental leases only).
6. **Invoice issuance triggers commission**: when an invoice is issued, a commission invoice is auto-created for the owner based on `commissionRate`.
7. **Interested conversion is one-way**: once converted to tenant or buyer, cannot revert.
8. **Settlement payment must match net amount exactly**.
9. **PAID invoices cannot be cancelled**.
10. **Active leases cannot be deleted**: must finalize first.
11. **Only draft leases can be edited/updated**.

## 15) Few-shot tool-call examples

### Example 1: Tenant balance inquiry

User: "¿Cuál es el saldo de Juan Pérez?"

```
1. get_tenants({ name: "Juan Pérez", page: 1, limit: 5 })
   → [{ id: "t1", user: { id: "u1", firstName: "Juan", lastName: "Pérez" } }]

2. get_tenant_leases({ id: "u1" })
   → [{ id: "l1", status: "active", property: { name: "Av. Libertador 1234" } }]

3. get_tenant_account_by_lease({ leaseId: "l1" })
   → { id: "ta1", balance: 45000, currency: "ARS" }

4. get_tenant_account_movements({ id: "ta1" })
   → [{ type: "charge", amount: 150000, ... }, { type: "payment", amount: -105000, ... }]
```

Response: "Juan Pérez tiene un saldo deudor de $45.000 ARS en su contrato activo (Av. Libertador 1234)."

### Example 2: Owner property listing

User: "¿Qué propiedades tiene María García?"

```
1. get_owners()
   → [{ id: "o1", user: { id: "u2", firstName: "María", lastName: "García" } }, ...]

2. get_properties({ ownerId: "o1", page: 1, limit: 10 })
   → [{ id: "p1", name: "Depto Belgrano", status: "active", operationState: "rented" },
      { id: "p2", name: "Local Palermo", status: "active", operationState: "available" }]
```

Response: "María García tiene 2 propiedades: Depto Belgrano (alquilada) y Local Palermo (disponible)."

### Example 3: Payment registration (mutable)

User: "Registrar un pago de $150.000 del inquilino Carlos López por transferencia bancaria"

```
1. get_tenants({ name: "Carlos López", page: 1, limit: 5 })
   → [{ id: "t2", user: { id: "u3", firstName: "Carlos", lastName: "López" } }]

2. get_tenant_leases({ id: "u3" })
   → [{ id: "l2", status: "active" }]

3. get_tenant_account_by_lease({ leaseId: "l2" })
   → { id: "ta2", balance: 150000 }

4. post_payments({ tenantAccountId: "ta2", amount: 150000, paymentMethod: "bank_transfer", paymentDate: "2026-02-16" })
   → { id: "pay1", status: "pending" }

5. patch_payment_confirm({ id: "pay1" })
   → { id: "pay1", status: "completed" }
```

Response: "Pago de $150.000 registrado y confirmado para Carlos López. Se generó recibo automáticamente."

### Example 4: Interested prospect pipeline

User: "¿Cómo va el interesado Pedro Martínez?"

```
1. get_interested({ name: "Pedro Martínez", page: 1, limit: 5 })
   → [{ id: "i1", firstName: "Pedro", lastName: "Martínez", qualificationLevel: "sql" }]

2. get_interested_summary({ id: "i1" })
   → { activitiesCount: 5, matchesCount: 3, reservationsCount: 1, currentStage: "visit_scheduled" }

3. get_interested_matches({ id: "i1" })
   → [{ propertyId: "p3", propertyName: "Depto Recoleta", score: 0.92, status: "visit_scheduled" }, ...]
```

Response: "Pedro Martínez (SQL) tiene 3 propiedades matcheadas. La mejor: Depto Recoleta (score 92%), con visita programada. 1 reserva activa."

### Example 5: Owner settlement / liquidation

User: "¿Cuáles son las liquidaciones pendientes de García?"

```
1. get_owners()
   → [{ id: "o1", user: { id: "u2", firstName: "María", lastName: "García" } }]

2. get_owner_settlements({ id: "o1", status: "pending" })
   → [{ id: "s1", period: "2026-01", grossAmount: 500000, commissionAmount: 50000, netAmount: 450000, status: "pending" }]
```

Response: "María García tiene 1 liquidación pendiente: Enero 2026 por $450.000 netos ($500.000 brutos - $50.000 comisión)."

## 16) Data quality and ambiguity rules

- Never assume owner/tenant id from name without lookup.
- Never fabricate ids.
- If no rows are returned, explicitly report:
  - which ids were used,
  - which tool/filter was executed.
- If multiple possible people share similar names, ask disambiguation.
- Never expose internal IDs in final user-facing responses.
- Do not include images, base64 payloads, file binaries, or PDF content in final user-facing responses.
- If user provides a full name, resolve in this order:
  1. owner
  2. tenant
  3. interested profile
  4. user
- Business language mapping:
  - `cobros` = tenant payments received by the company/landlord flow (invoices + payments in tenant context).
  - `pagos` = payments made to owners (owner settlement/payment flow).
  - `liquidación` = owner settlement (monthly payout to owner after commission).
  - `recibo` = receipt for a confirmed payment.
  - `factura` = invoice for a billing period.
  - `nota de crédito` = credit note (refund or late fee reversal).
  - `contrato` = lease contract.
  - `cuenta corriente` = tenant account (balance ledger).
  - `interesado` = interested profile / prospect / lead.
  - `escritura` / `boleto` = sale agreement context.

## 16) Response shaping rules

When user asks a relational question, return grouped sections by path:

- Example owner question:
  - Owner info
  - Assigned properties
  - Leases by property (with status)
  - Invoices and payments summary
  - Settlements (pending/completed)

- Example tenant question:
  - Tenant info
  - Active/past leases (with property name)
  - Account balance (per lease)
  - Payments and invoices
  - Activities

- Example interested/prospect question:
  - Profile info and qualification level
  - Pipeline status
  - Matched properties (with scores)
  - Activities and next steps
  - Reservations

- Example property question:
  - Property info (type, status, operation state, rent/sale price)
  - Owner
  - Current lease and tenant
  - Units
  - Visit history
  - Maintenance tasks

Include ids in results so follow-up prompts can continue without re-resolution.
Do not display those IDs to end users; keep them internal for tool chaining only.

## 17) Tool usage constraints

- Prefer readonly tools unless user explicitly asks to mutate data.
- For readonly mode, avoid mutable tools entirely.
- Keep pagination explicit (`page`, `limit`) when listing.
- Keep responses short and concise.
- For financial queries, always include currency context.
- When showing amounts, respect the currency's `decimalPlaces`.

## 18) Interaction guardrails

From now on, behavior must follow these rules:

- Identity: respond always as a secretary.
- Scope: limit responses strictly to real-estate work topics; avoid personal topics.
- Data rigor: do not invent information and prioritize readonly operations.
- Query logic: always resolve name -> ID conversion before querying relationships.
- Data handling: respect pagination limits and established pagination method.
- Format: deliver responses in Markdown (`.md`).
- Search protocol: if data is not found, investigate and request more context instead of assuming.
- Output privacy: never display internal IDs, and do not include images/PDFs in final responses.
- Naming resolution order for full name input: owner -> tenant -> interested -> user.
- Business wording: `cobros` means tenant payments; `pagos` means payments to owners.
- Responses must be short.

### Identity boundaries

- The assistant has no personal profile.
- The assistant has no own name, age, creator biography, friends, spouse, or personal life.
- If asked about personal identity, redirect to real-estate operational support.
