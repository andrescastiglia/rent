BEGIN;
-- Serialize the initial scan with all receipt/note writers, including imports.
LOCK TABLE receipts, credit_notes IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS payment_document_counters (
  kind text PRIMARY KEY CHECK (kind IN ('receipt','credit_note')),
  last_value numeric(50,0) NOT NULL CHECK (last_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION protect_payment_document_counter() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION 'Payment document counters cannot be deleted';
  END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.last_value < OLD.last_value THEN
    RAISE EXCEPTION 'Payment document counters cannot move backwards';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS payment_document_counter_monotonic ON payment_document_counters;
CREATE TRIGGER payment_document_counter_monotonic BEFORE UPDATE OR DELETE ON payment_document_counters
  FOR EACH ROW EXECUTE FUNCTION protect_payment_document_counter();
DROP TRIGGER IF EXISTS payment_document_counter_no_truncate ON payment_document_counters;
CREATE TRIGGER payment_document_counter_no_truncate BEFORE TRUNCATE ON payment_document_counters
  FOR EACH STATEMENT EXECUTE FUNCTION protect_payment_document_counter();

-- Include cancelled and soft-deleted notes; preserve a previously advanced counter.
INSERT INTO payment_document_counters(kind,last_value)
SELECT 'receipt', COALESCE(MAX(substring(receipt_number FROM '^REC-[0-9]{6}-([0-9]+)$')::numeric),0) FROM receipts
UNION ALL
SELECT 'credit_note', COALESCE(MAX(substring(note_number FROM '^NC-[0-9]{6}-([0-9]+)$')::numeric),0) FROM credit_notes
ON CONFLICT (kind) DO UPDATE SET last_value=GREATEST(payment_document_counters.last_value,EXCLUDED.last_value),updated_at=clock_timestamp();

CREATE OR REPLACE FUNCTION next_payment_document_number(document_kind text, issue_time timestamptz DEFAULT CURRENT_TIMESTAMP)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  namespace text;
  prefix text;
  next_value numeric;
  formatted text;
BEGIN
  CASE document_kind
    WHEN 'receipt' THEN namespace := 'receipt-number'; prefix := 'REC';
    WHEN 'credit_note' THEN namespace := 'credit-note-number'; prefix := 'NC';
    ELSE RAISE EXCEPTION 'Unsupported payment document kind';
  END CASE;
  IF issue_time IS NULL THEN RAISE EXCEPTION 'Payment document issue time is required'; END IF;
  -- Keep the existing namespace during rolling deployment.
  PERFORM pg_advisory_xact_lock(hashtextextended(namespace,0));
  SELECT last_value+1 INTO next_value FROM payment_document_counters WHERE kind=document_kind FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment document counter is unavailable'; END IF;
  formatted := prefix || '-' || to_char(issue_time AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYYMM') || '-' ||
    lpad(next_value::text,GREATEST(4,length(next_value::text)),'0');
  IF length(formatted)>50 THEN RAISE EXCEPTION 'Payment document number capacity exhausted; manual review required'; END IF;
  UPDATE payment_document_counters SET last_value=next_value,updated_at=clock_timestamp() WHERE kind=document_kind;
  RETURN formatted;
END;
$$;

CREATE OR REPLACE FUNCTION track_payment_document_number() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  document_kind text := TG_ARGV[0];
  field_name text := TG_ARGV[1];
  namespace text := TG_ARGV[2];
  pattern text := TG_ARGV[3];
  value numeric;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)->>field_name) IS DISTINCT FROM (to_jsonb(OLD)->>field_name) THEN
      RAISE EXCEPTION 'Payment document number is immutable';
    END IF;
    RETURN NEW;
  END IF;
  value := substring(to_jsonb(NEW)->>field_name FROM pattern)::numeric;
  IF value IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(namespace,0));
    INSERT INTO payment_document_counters(kind,last_value) VALUES(document_kind,value)
    ON CONFLICT (kind) DO UPDATE SET last_value=GREATEST(payment_document_counters.last_value,EXCLUDED.last_value),updated_at=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS receipt_number_counter ON receipts;
CREATE TRIGGER receipt_number_counter BEFORE INSERT OR UPDATE OF receipt_number ON receipts
  FOR EACH ROW EXECUTE FUNCTION track_payment_document_number('receipt','receipt_number','receipt-number','^REC-[0-9]{6}-([0-9]+)$');
DROP TRIGGER IF EXISTS credit_note_number_counter ON credit_notes;
CREATE TRIGGER credit_note_number_counter BEFORE INSERT OR UPDATE OF note_number ON credit_notes
  FOR EACH ROW EXECUTE FUNCTION track_payment_document_number('credit_note','note_number','credit-note-number','^NC-[0-9]{6}-([0-9]+)$');
COMMIT;
