-- Ensure a virtual bank alias can identify exactly one active account.
-- The partial index preserves historical/soft-deleted accounts.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM bank_accounts
        WHERE deleted_at IS NULL
          AND is_active = TRUE
          AND alias IS NOT NULL
        GROUP BY LOWER(alias)
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot enforce active bank alias uniqueness: duplicate active aliases exist';
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_active_alias_unique
    ON bank_accounts(LOWER(alias))
    WHERE deleted_at IS NULL AND alias IS NOT NULL AND is_active = TRUE;
