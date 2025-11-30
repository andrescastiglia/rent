-- =============================================================================
-- Migration: 005_create_staff.sql
-- Description: Create staff table (maintenance personnel extension of users)
-- =============================================================================

-- Create ENUM for specializations
CREATE TYPE staff_specialization AS ENUM (
    'plumbing',
    'electrical',
    'hvac',
    'carpentry',
    'painting',
    'cleaning',
    'landscaping',
    'general_maintenance',
    'locksmith',
    'appliance_repair',
    'other'
);

-- Create staff table
CREATE TABLE staff (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    
    -- Specialization and rates
    specialization staff_specialization NOT NULL DEFAULT 'general_maintenance',
    hourly_rate DECIMAL(10, 2),
    
    -- Availability
    is_available BOOLEAN NOT NULL DEFAULT true,
    available_from TIME,
    available_to TIME,
    
    -- Service area
    service_area_radius_km INT, -- Service radius in kilometers
    
    -- Performance tracking
    jobs_completed INT NOT NULL DEFAULT 0,
    average_rating DECIMAL(3, 2), -- 0.00 to 5.00
    
    -- Additional information
    certifications TEXT[], -- Array of certifications
    languages TEXT[], -- Array of languages spoken
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT staff_hourly_rate_positive CHECK (hourly_rate IS NULL OR hourly_rate > 0),
    CONSTRAINT staff_jobs_completed_positive CHECK (jobs_completed >= 0),
    CONSTRAINT staff_rating_range CHECK (average_rating IS NULL OR (average_rating >= 0 AND average_rating <= 5)),
    CONSTRAINT staff_service_area_positive CHECK (service_area_radius_km IS NULL OR service_area_radius_km > 0)
);

-- Create indexes
CREATE INDEX idx_staff_company_id ON staff(company_id);
CREATE INDEX idx_staff_specialization ON staff(specialization);
CREATE INDEX idx_staff_is_available ON staff(is_available);
CREATE INDEX idx_staff_average_rating ON staff(average_rating DESC NULLS LAST);
CREATE INDEX idx_staff_created_at ON staff(created_at DESC);

-- Create composite index for common queries
CREATE INDEX idx_staff_company_available ON staff(company_id, is_available);
CREATE INDEX idx_staff_specialization_available ON staff(specialization, is_available);

-- Add comments for documentation
COMMENT ON TABLE staff IS 'Maintenance staff/personnel (extends users table)';
COMMENT ON COLUMN staff.user_id IS 'Foreign key to users table (also primary key)';
COMMENT ON COLUMN staff.company_id IS 'Foreign key to companies table';
COMMENT ON COLUMN staff.specialization IS 'Primary area of expertise';
COMMENT ON COLUMN staff.hourly_rate IS 'Hourly rate charged for services';
COMMENT ON COLUMN staff.is_available IS 'Whether staff member is currently available for assignments';
COMMENT ON COLUMN staff.jobs_completed IS 'Total number of completed jobs';
COMMENT ON COLUMN staff.average_rating IS 'Average customer rating (0-5 stars)';
COMMENT ON COLUMN staff.certifications IS 'Array of professional certifications';

-- Create trigger for updated_at
CREATE TRIGGER update_staff_updated_at
    BEFORE UPDATE ON staff
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();

-- Create function to validate staff user role
CREATE OR REPLACE FUNCTION validate_staff_user_role()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users 
        WHERE id = NEW.user_id 
        AND role = 'staff'
        AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'User must have role ''staff'' to be in staff table';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate role
CREATE TRIGGER validate_staff_role
    BEFORE INSERT OR UPDATE ON staff
    FOR EACH ROW
    EXECUTE FUNCTION validate_staff_user_role();
