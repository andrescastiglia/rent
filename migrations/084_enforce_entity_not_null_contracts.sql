-- =============================================================================
-- Migration: 084_enforce_entity_not_null_contracts.sql
-- Description: Tighten nullable database columns that current TypeORM entities
--              define as required. Pre-checked against production data: no
--              targeted column contains NULL values.
-- =============================================================================

ALTER TABLE "admins"
    ALTER COLUMN "allowed_modules" SET NOT NULL,
    ALTER COLUMN "ip_whitelist" SET NOT NULL,
    ALTER COLUMN "is_super_admin" SET NOT NULL,
    ALTER COLUMN "permissions" SET NOT NULL;

ALTER TABLE "bank_accounts"
    ALTER COLUMN "bank_name" SET NOT NULL,
    ALTER COLUMN "company_id" SET NOT NULL,
    ALTER COLUMN "currency" SET NOT NULL,
    ALTER COLUMN "is_default" SET NOT NULL,
    ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "billing_jobs"
    ALTER COLUMN "dry_run" SET NOT NULL,
    ALTER COLUMN "error_log" SET NOT NULL,
    ALTER COLUMN "parameters" SET NOT NULL,
    ALTER COLUMN "records_failed" SET NOT NULL,
    ALTER COLUMN "records_processed" SET NOT NULL,
    ALTER COLUMN "records_skipped" SET NOT NULL,
    ALTER COLUMN "records_total" SET NOT NULL;

ALTER TABLE "commission_invoices"
    ALTER COLUMN "currency" SET NOT NULL,
    ALTER COLUMN "paid_amount" SET NOT NULL,
    ALTER COLUMN "related_invoices" SET NOT NULL,
    ALTER COLUMN "tax_amount" SET NOT NULL;

ALTER TABLE "companies"
    ALTER COLUMN "arca_enabled" SET NOT NULL,
    ALTER COLUMN "arca_production_mode" SET NOT NULL,
    ALTER COLUMN "country" SET NOT NULL,
    ALTER COLUMN "is_active" SET NOT NULL,
    ALTER COLUMN "max_properties" SET NOT NULL,
    ALTER COLUMN "max_users" SET NOT NULL,
    ALTER COLUMN "settings" SET NOT NULL,
    ALTER COLUMN "withholding_agent_ganancias" SET NOT NULL,
    ALTER COLUMN "withholding_agent_iibb" SET NOT NULL,
    ALTER COLUMN "withholding_rates" SET NOT NULL;

ALTER TABLE "currencies"
    ALTER COLUMN "is_active" SET NOT NULL;

ALTER TABLE "documents"
    ALTER COLUMN "metadata" SET NOT NULL;

ALTER TABLE "interested_profiles"
    ALTER COLUMN "consent_contact" SET NOT NULL,
    ALTER COLUMN "custom_fields" SET NOT NULL,
    ALTER COLUMN "has_pets" SET NOT NULL;

ALTER TABLE "invoices"
    ALTER COLUMN "adjustment_applied" SET NOT NULL,
    ALTER COLUMN "currency" SET NOT NULL,
    ALTER COLUMN "discount_amount" SET NOT NULL,
    ALTER COLUMN "late_fee_amount" SET NOT NULL,
    ALTER COLUMN "line_items" SET NOT NULL,
    ALTER COLUMN "paid_amount" SET NOT NULL,
    ALTER COLUMN "tax_amount" SET NOT NULL,
    ALTER COLUMN "withholding_ganancias" SET NOT NULL,
    ALTER COLUMN "withholding_iibb" SET NOT NULL,
    ALTER COLUMN "withholding_iva" SET NOT NULL;

ALTER TABLE "lease_amendments"
    ALTER COLUMN "new_values" SET NOT NULL,
    ALTER COLUMN "previous_values" SET NOT NULL,
    ALTER COLUMN "signed_by_owner" SET NOT NULL,
    ALTER COLUMN "signed_by_tenant" SET NOT NULL;

ALTER TABLE "leases"
    ALTER COLUMN "additional_expenses" SET NOT NULL,
    ALTER COLUMN "adjustment_frequency_months" SET NOT NULL,
    ALTER COLUMN "auto_generate_invoices" SET NOT NULL,
    ALTER COLUMN "currency" SET NOT NULL,
    ALTER COLUMN "deposit_currency" SET NOT NULL,
    ALTER COLUMN "expenses_included" SET NOT NULL,
    ALTER COLUMN "increase_clause_schedule" SET NOT NULL,
    ALTER COLUMN "late_fee_grace_days" SET NOT NULL,
    ALTER COLUMN "late_fee_value" SET NOT NULL,
    ALTER COLUMN "payment_due_day" SET NOT NULL,
    ALTER COLUMN "signed_by_owner" SET NOT NULL,
    ALTER COLUMN "signed_by_tenant" SET NOT NULL;

ALTER TABLE "maintenance_ticket_comments"
    ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "maintenance_tickets"
    ALTER COLUMN "reported_by_user_id" SET NOT NULL;

ALTER TABLE "notification_preferences"
    ALTER COLUMN "channel" SET NOT NULL,
    ALTER COLUMN "company_id" SET NOT NULL,
    ALTER COLUMN "is_enabled" SET NOT NULL;

ALTER TABLE "owners"
    ALTER COLUMN "commission_rate" SET NOT NULL,
    ALTER COLUMN "country" SET NOT NULL,
    ALTER COLUMN "invoice_prefix" SET NOT NULL,
    ALTER COLUMN "next_invoice_number" SET NOT NULL,
    ALTER COLUMN "payment_method" SET NOT NULL,
    ALTER COLUMN "tax_id_type" SET NOT NULL;

ALTER TABLE "payment_gateway_transactions"
    ALTER COLUMN "installments" SET NOT NULL,
    ALTER COLUMN "metadata" SET NOT NULL;

ALTER TABLE "payment_items"
    ALTER COLUMN "quantity" SET NOT NULL;

ALTER TABLE "payments"
    ALTER COLUMN "currency" SET NOT NULL,
    ALTER COLUMN "gateway_response" SET NOT NULL;

ALTER TABLE "portal_listings"
    ALTER COLUMN "listing_data" SET NOT NULL;

ALTER TABLE "properties"
    ALTER COLUMN "address_country" SET NOT NULL,
    ALTER COLUMN "allows_pets" SET NOT NULL,
    ALTER COLUMN "documents" SET NOT NULL,
    ALTER COLUMN "images" SET NOT NULL,
    ALTER COLUMN "sale_currency" SET NOT NULL,
    ALTER COLUMN "total_units" SET NOT NULL;

ALTER TABLE "property_features"
    ALTER COLUMN "display_order" SET NOT NULL,
    ALTER COLUMN "is_highlighted" SET NOT NULL;

ALTER TABLE "property_visits"
    ALTER COLUMN "has_offer" SET NOT NULL,
    ALTER COLUMN "offer_currency" SET NOT NULL;

ALTER TABLE "receipts"
    ALTER COLUMN "currency" SET NOT NULL;

ALTER TABLE "sale_agreements"
    ALTER COLUMN "currency" SET NOT NULL,
    ALTER COLUMN "due_day" SET NOT NULL,
    ALTER COLUMN "paid_amount" SET NOT NULL;

ALTER TABLE "sale_receipts"
    ALTER COLUMN "copy_count" SET NOT NULL,
    ALTER COLUMN "currency" SET NOT NULL;

ALTER TABLE "settlements"
    ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "staff"
    ALTER COLUMN "availability_schedule" SET NOT NULL,
    ALTER COLUMN "currency" SET NOT NULL,
    ALTER COLUMN "total_jobs" SET NOT NULL;

ALTER TABLE "tenant_accounts"
    ALTER COLUMN "currency" SET NOT NULL,
    ALTER COLUMN "is_active" SET NOT NULL;

ALTER TABLE "units"
    ALTER COLUMN "bathrooms" SET NOT NULL,
    ALTER COLUMN "bedrooms" SET NOT NULL,
    ALTER COLUMN "currency" SET NOT NULL,
    ALTER COLUMN "expenses" SET NOT NULL,
    ALTER COLUMN "has_parking" SET NOT NULL,
    ALTER COLUMN "has_storage" SET NOT NULL,
    ALTER COLUMN "images" SET NOT NULL,
    ALTER COLUMN "is_furnished" SET NOT NULL,
    ALTER COLUMN "parking_spots" SET NOT NULL;

ALTER TABLE "users"
    ALTER COLUMN "company_id" SET NOT NULL,
    ALTER COLUMN "email_verified" SET NOT NULL,
    ALTER COLUMN "is_active" SET NOT NULL,
    ALTER COLUMN "language" SET NOT NULL;
