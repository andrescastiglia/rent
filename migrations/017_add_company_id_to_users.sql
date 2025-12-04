-- =============================================================================
-- Migration: 017_add_company_id_to_users
-- Description: Add company_id column to users table with default company
-- =============================================================================

-- Add company_id column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS company_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- Add foreign key constraint
ALTER TABLE users 
ADD CONSTRAINT fk_users_company 
FOREIGN KEY (company_id) REFERENCES companies(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);

-- Update existing users to have the default company
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000001'::uuid 
WHERE company_id IS NULL;

-- Add comment
COMMENT ON COLUMN users.company_id IS 'Company the user belongs to';
