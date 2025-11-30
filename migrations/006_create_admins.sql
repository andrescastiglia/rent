-- =============================================================================
-- Migration: 006_create_admins.sql
-- Description: Create admins table (system administrators extension of users)
-- =============================================================================

-- Create admins table
CREATE TABLE admins (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    -- Admin level
    is_super_admin BOOLEAN NOT NULL DEFAULT false,
    
    -- Permissions (JSONB for flexibility)
    permissions JSONB NOT NULL DEFAULT '{
        "users": {"read": true, "write": false, "delete": false},
        "properties": {"read": true, "write": false, "delete": false},
        "leases": {"read": true, "write": false, "delete": false},
        "payments": {"read": true, "write": false, "delete": false},
        "maintenance": {"read": true, "write": false, "delete": false},
        "reports": {"read": true, "write": false, "delete": false},
        "settings": {"read": false, "write": false, "delete": false}
    }'::jsonb,
    
    -- Access restrictions
    ip_whitelist TEXT[], -- Array of allowed IP addresses
    allowed_modules TEXT[], -- Array of module names they can access
    
    -- Activity tracking
    last_admin_action_at TIMESTAMPTZ,
    admin_actions_count INT NOT NULL DEFAULT 0,
    
    -- Additional information
    department VARCHAR(100),
    title VARCHAR(100),
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT admins_actions_count_positive CHECK (admin_actions_count >= 0)
);

-- Create indexes
CREATE INDEX idx_admins_is_super_admin ON admins(is_super_admin);
CREATE INDEX idx_admins_last_action ON admins(last_admin_action_at DESC NULLS LAST);
CREATE INDEX idx_admins_created_at ON admins(created_at DESC);

-- Create GIN index for JSONB permissions
CREATE INDEX idx_admins_permissions ON admins USING GIN (permissions);

-- Add comments for documentation
COMMENT ON TABLE admins IS 'System administrators (extends users table)';
COMMENT ON COLUMN admins.user_id IS 'Foreign key to users table (also primary key)';
COMMENT ON COLUMN admins.is_super_admin IS 'Whether this admin has full system access';
COMMENT ON COLUMN admins.permissions IS 'JSONB object defining granular permissions per module';
COMMENT ON COLUMN admins.ip_whitelist IS 'Array of IP addresses allowed to login (null = any IP)';
COMMENT ON COLUMN admins.allowed_modules IS 'Array of module names this admin can access';
COMMENT ON COLUMN admins.admin_actions_count IS 'Total number of admin actions performed';

-- Create trigger for updated_at
CREATE TRIGGER update_admins_updated_at
    BEFORE UPDATE ON admins
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();

-- Create function to validate admin user role
CREATE OR REPLACE FUNCTION validate_admin_user_role()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users 
        WHERE id = NEW.user_id 
        AND role = 'admin'
        AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'User must have role ''admin'' to be in admins table';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate role
CREATE TRIGGER validate_admin_role
    BEFORE INSERT OR UPDATE ON admins
    FOR EACH ROW
    EXECUTE FUNCTION validate_admin_user_role();

-- Create function to grant super admin all permissions
CREATE OR REPLACE FUNCTION grant_super_admin_permissions()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_super_admin = true THEN
        NEW.permissions = '{
            "users": {"read": true, "write": true, "delete": true},
            "properties": {"read": true, "write": true, "delete": true},
            "leases": {"read": true, "write": true, "delete": true},
            "payments": {"read": true, "write": true, "delete": true},
            "maintenance": {"read": true, "write": true, "delete": true},
            "reports": {"read": true, "write": true, "delete": true},
            "settings": {"read": true, "write": true, "delete": true}
        }'::jsonb;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-grant super admin permissions
CREATE TRIGGER grant_super_admin_perms
    BEFORE INSERT OR UPDATE ON admins
    FOR EACH ROW
    WHEN (NEW.is_super_admin = true)
    EXECUTE FUNCTION grant_super_admin_permissions();
