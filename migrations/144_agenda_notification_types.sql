ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'agenda_assigned';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'agenda_rescheduled';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'agenda_changed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'agenda_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'agenda_overdue';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'agenda_proposal';
