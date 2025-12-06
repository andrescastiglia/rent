-- =============================================================================
-- Migration: 030_create_notification_preferences
-- Description: Create table for user notification preferences
-- =============================================================================

-- Create notification type ENUM
CREATE TYPE notification_type AS ENUM (
    'invoice_issued',
    'payment_reminder',
    'payment_received',
    'overdue_notice',
    'late_fee_applied',
    'monthly_report',
    'lease_expiring',
    'rent_adjustment'
);

-- Create notification frequency ENUM
CREATE TYPE notification_frequency AS ENUM (
    'immediate',
    'daily_digest',
    'weekly_digest',
    'disabled'
);

-- Create notification_preferences table
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Notification settings
    notification_type notification_type NOT NULL,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    frequency notification_frequency NOT NULL DEFAULT 'immediate',
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique preference per user per type
    CONSTRAINT notification_preferences_unique UNIQUE (user_id, notification_type)
);

-- Create indexes
CREATE INDEX idx_notification_preferences_user ON notification_preferences(user_id);
CREATE INDEX idx_notification_preferences_type ON notification_preferences(notification_type);
CREATE INDEX idx_notification_preferences_email_enabled 
    ON notification_preferences(user_id, email_enabled) 
    WHERE email_enabled = TRUE;

-- Create trigger for updated_at
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE notification_preferences IS 'User preferences for email notifications';
COMMENT ON COLUMN notification_preferences.notification_type IS 'Type of notification';
COMMENT ON COLUMN notification_preferences.email_enabled IS 'Whether email notifications are enabled';
COMMENT ON COLUMN notification_preferences.frequency IS 'How often to send notifications';
