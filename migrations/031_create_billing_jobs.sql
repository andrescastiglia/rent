-- =============================================================================
-- Migration: 031_create_billing_jobs
-- Description: Create table for tracking batch billing job executions
-- =============================================================================

-- Create job type ENUM
CREATE TYPE billing_job_type AS ENUM (
    'billing',
    'overdue',
    'reminders',
    'late_fees',
    'sync_indices',
    'reports',
    'exchange_rates'
);

-- Create job status ENUM
CREATE TYPE billing_job_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed',
    'partial_failure'
);

-- Create billing_jobs table
CREATE TABLE billing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Job identification
    job_type billing_job_type NOT NULL,
    status billing_job_status NOT NULL DEFAULT 'pending',
    
    -- Execution details
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    
    -- Processing statistics
    records_total INTEGER DEFAULT 0,
    records_processed INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    
    -- Error handling
    error_message TEXT,
    error_log JSONB DEFAULT '[]'::jsonb,
    
    -- Context
    parameters JSONB DEFAULT '{}'::jsonb,
    dry_run BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT billing_jobs_duration_check CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT billing_jobs_records_check CHECK (
        records_total >= 0 AND 
        records_processed >= 0 AND 
        records_failed >= 0 AND
        records_skipped >= 0
    )
);

-- Create indexes
CREATE INDEX idx_billing_jobs_type ON billing_jobs(job_type);
CREATE INDEX idx_billing_jobs_status ON billing_jobs(status);
CREATE INDEX idx_billing_jobs_started_at ON billing_jobs(started_at DESC);
CREATE INDEX idx_billing_jobs_type_status ON billing_jobs(job_type, status);

-- Create trigger for updated_at
CREATE TRIGGER update_billing_jobs_updated_at
    BEFORE UPDATE ON billing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE billing_jobs IS 'Tracking table for batch billing job executions';
COMMENT ON COLUMN billing_jobs.job_type IS 'Type of batch job executed';
COMMENT ON COLUMN billing_jobs.status IS 'Current status of the job';
COMMENT ON COLUMN billing_jobs.duration_ms IS 'Job execution duration in milliseconds';
COMMENT ON COLUMN billing_jobs.records_total IS 'Total records to process';
COMMENT ON COLUMN billing_jobs.records_processed IS 'Successfully processed records';
COMMENT ON COLUMN billing_jobs.records_failed IS 'Failed records';
COMMENT ON COLUMN billing_jobs.error_log IS 'JSON array of individual record errors';
COMMENT ON COLUMN billing_jobs.parameters IS 'Job parameters (date range, filters, etc.)';
COMMENT ON COLUMN billing_jobs.dry_run IS 'Whether job was executed in dry-run mode';
