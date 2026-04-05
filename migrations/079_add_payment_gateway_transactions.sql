CREATE TABLE payment_gateway_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    gateway VARCHAR(50) NOT NULL DEFAULT 'mercadopago',
    external_id VARCHAR(255),
    external_payment_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
    payment_method VARCHAR(100),
    installments INTEGER DEFAULT 1,
    init_point TEXT,
    sandbox_init_point TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_pgt_company ON payment_gateway_transactions(company_id);
CREATE INDEX idx_pgt_invoice ON payment_gateway_transactions(invoice_id);
CREATE INDEX idx_pgt_external ON payment_gateway_transactions(external_id) WHERE external_id IS NOT NULL;
CREATE TRIGGER update_pgt_updated_at BEFORE UPDATE ON payment_gateway_transactions FOR EACH ROW EXECUTE FUNCTION functions.update_updated_at_column();
