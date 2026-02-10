-- =============================================================================
-- Migration: 068_simplify_interested_status_stages.sql
-- Description: Restrict interested stages to interested -> tenant|buyer
-- =============================================================================

ALTER TYPE interested_status ADD VALUE IF NOT EXISTS 'tenant';
ALTER TYPE interested_status ADD VALUE IF NOT EXISTS 'buyer';

UPDATE interested_profiles
SET status = CASE
    WHEN converted_to_tenant_id IS NOT NULL THEN 'tenant'::interested_status
    WHEN converted_to_sale_agreement_id IS NOT NULL THEN 'buyer'::interested_status
    WHEN status::text IN ('qualified', 'matching', 'visit_scheduled', 'offer_made', 'won', 'lost')
        THEN 'interested'::interested_status
    ELSE status
END;

UPDATE interested_stage_history h
SET from_status = CASE
    WHEN h.from_status::text = 'won' THEN
        CASE
            WHEN p.converted_to_tenant_id IS NOT NULL THEN 'tenant'::interested_status
            WHEN p.converted_to_sale_agreement_id IS NOT NULL THEN 'buyer'::interested_status
            ELSE 'interested'::interested_status
        END
    WHEN h.from_status::text IN ('qualified', 'matching', 'visit_scheduled', 'offer_made', 'lost')
        THEN 'interested'::interested_status
    ELSE h.from_status
END,
    to_status = CASE
    WHEN h.to_status::text = 'won' THEN
        CASE
            WHEN p.converted_to_tenant_id IS NOT NULL THEN 'tenant'::interested_status
            WHEN p.converted_to_sale_agreement_id IS NOT NULL THEN 'buyer'::interested_status
            ELSE 'interested'::interested_status
        END
    WHEN h.to_status::text IN ('qualified', 'matching', 'visit_scheduled', 'offer_made', 'lost')
        THEN 'interested'::interested_status
    ELSE h.to_status
END
FROM interested_profiles p
WHERE p.id = h.interested_profile_id;

ALTER TABLE interested_profiles
    ALTER COLUMN status SET DEFAULT 'interested'::interested_status;
