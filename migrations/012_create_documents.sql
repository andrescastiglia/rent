-- =============================================================================
-- Migration: 012_create_documents
-- Description: Create documents table for file management (images, PDFs, etc.)
-- =============================================================================

-- Create document type ENUM
CREATE TYPE document_type AS ENUM ('image', 'contract', 'invoice', 'receipt', 'other');

-- Create document status ENUM
CREATE TYPE document_status AS ENUM ('pending', 'uploaded', 'failed');

-- Create documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Polymorphic association (can belong to property, unit, lease, etc.)
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    
    -- Document details
    doc_type document_type NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    
    -- Status
    status document_status DEFAULT 'pending',
    
    -- Metadata
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT documents_file_size_check CHECK (file_size > 0 AND file_size <= 10485760) -- Max 10MB
);

-- Create indexes
CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_deleted_at ON documents(deleted_at);

-- Create trigger for updated_at
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE documents IS 'File storage metadata for images, contracts, and other documents';
COMMENT ON COLUMN documents.entity_type IS 'Type of entity this document belongs to (property, unit, lease, etc.)';
COMMENT ON COLUMN documents.entity_id IS 'ID of the entity this document belongs to';
COMMENT ON COLUMN documents.s3_key IS 'S3 object key (path) for the file';
COMMENT ON COLUMN documents.file_size IS 'File size in bytes (max 10MB)';
