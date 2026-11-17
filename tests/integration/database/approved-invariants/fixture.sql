-- Disposable evidence fixture only. This is not a production migration/schema.
CREATE SCHEMA approved_invariants_probe;
SET search_path = approved_invariants_probe, public;

CREATE TYPE practice_mode AS ENUM (
  'PERSONALIZED_PRACTICE',
  'PUBLISHED_FIXED'
);

CREATE TYPE attempt_state AS ENUM (
  'CREATED',
  'IN_PROGRESS',
  'SUBMITTED',
  'EXPIRED',
  'GRADED',
  'CANCELLED',
  'INVALIDATED'
);

CREATE TABLE attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  form_id uuid NOT NULL,
  mode practice_mode NOT NULL,
  state attempt_state NOT NULL,
  created_at timestamptz NOT NULL,
  admission_until_at_creation timestamptz NOT NULL,
  start_before_at timestamptz NOT NULL,
  CONSTRAINT attempts_positive_start_window
    CHECK (start_before_at > created_at),
  CONSTRAINT attempts_exact_start_deadline
    CHECK (
      start_before_at = LEAST(
        created_at + interval '600 seconds',
        admission_until_at_creation
      )
    )
);

CREATE UNIQUE INDEX attempts_one_active_per_user
  ON attempts (user_id)
  WHERE state IN ('CREATED', 'IN_PROGRESS');

CREATE FUNCTION reject_attempt_creation_context_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.id,
    NEW.user_id,
    NEW.form_id,
    NEW.mode,
    NEW.created_at,
    NEW.admission_until_at_creation,
    NEW.start_before_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.user_id,
    OLD.form_id,
    OLD.mode,
    OLD.created_at,
    OLD.admission_until_at_creation,
    OLD.start_before_at
  ) THEN
    RAISE EXCEPTION 'probe attempt creation context is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER attempts_creation_context_immutable
  BEFORE UPDATE ON attempts
  FOR EACH ROW
  EXECUTE FUNCTION reject_attempt_creation_context_change();
