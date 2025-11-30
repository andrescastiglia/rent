-- =============================================================================
-- Migration: 002_create_users.sql
-- Description: Create users table for authentication and base user data
-- =============================================================================

-- Create ENUM for user roles
CREATE TYPE user_role AS ENUM ('admin', 'owner', 'tenant', 'staff');

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Authentication
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Personal information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    avatar_url TEXT,
    
    -- Role and status
    role user_role NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_email_verified BOOLEAN NOT NULL DEFAULT false,
    email_verified_at TIMESTAMPTZ,
    
    -- Login tracking
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    
    -- Security
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_first_name_not_empty CHECK (LENGTH(TRIM(first_name)) > 0),
    CONSTRAINT users_last_name_not_empty CHECK (LENGTH(TRIM(last_name)) > 0),
    CONSTRAINT users_failed_attempts_positive CHECK (failed_login_attempts >= 0)
);

-- Create indexes for better query performance
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_is_active ON users(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_is_email_verified ON users(is_email_verified) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_last_login ON users(last_login_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- Create composite index for common queries
CREATE INDEX idx_users_role_active ON users(role, is_active) WHERE deleted_at IS NULL;

-- Add comments for documentation
COMMENT ON TABLE users IS 'Base users table for authentication and user management';
COMMENT ON COLUMN users.id IS 'Primary key (UUID v4)';
COMMENT ON COLUMN users.email IS 'Unique email address for authentication';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hash of the user password';
COMMENT ON COLUMN users.role IS 'User role (admin, owner, tenant, staff)';
COMMENT ON COLUMN users.is_active IS 'Whether the user account is active';
COMMENT ON COLUMN users.is_email_verified IS 'Whether the email has been verified';
COMMENT ON COLUMN users.failed_login_attempts IS 'Counter for failed login attempts';
COMMENT ON COLUMN users.locked_until IS 'Account locked until this timestamp (null if not locked)';
COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp';

-- Create trigger for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();

-- Create function to reset failed login attempts
CREATE OR REPLACE FUNCTION reset_failed_login_attempts()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at AND NEW.last_login_at IS NOT NULL THEN
        NEW.failed_login_attempts = 0;
        NEW.locked_until = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to reset failed attempts on successful login
CREATE TRIGGER reset_failed_attempts_on_login
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION reset_failed_login_attempts();
