-- AUTH-001 local development identity boundary. This migration creates an
-- empty synthetic-only marker; only the explicit dev bootstrap may initialize it.

DO $role$
DECLARE
  identity_role record;
BEGIN
  SELECT oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
         rolbypassrls, rolinherit
    INTO identity_role
    FROM pg_roles
   WHERE rolname = 'tsa_identity';
  IF NOT FOUND THEN
    CREATE ROLE tsa_identity NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS NOINHERIT;
  ELSIF identity_role.rolcanlogin OR identity_role.rolsuper OR identity_role.rolcreatedb
        OR identity_role.rolcreaterole OR identity_role.rolreplication
        OR identity_role.rolbypassrls OR identity_role.rolinherit THEN
    RAISE EXCEPTION 'Existing identity role has unsafe attributes' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members WHERE member = identity_role.oid
  ) THEN
    RAISE EXCEPTION 'Identity role cannot inherit another role' USING ERRCODE = '42501';
  END IF;
END
$role$;

CREATE TABLE tsa_private.local_synthetic_environment (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  profile text NOT NULL CHECK (profile = 'SYNTHETIC_ONLY'),
  seed_version text NOT NULL CHECK (seed_version = 'local-identity/1'),
  initialized_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE tsa_private.local_auth_sessions (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^sha256:[0-9a-f]{64}$'),
  csrf_hash text NOT NULL CHECK (csrf_hash ~ '^sha256:[0-9a-f]{64}$'),
  user_id uuid REFERENCES tsa.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (isfinite(created_at) AND isfinite(expires_at) AND expires_at > created_at),
  CHECK (expires_at <= created_at + interval '8 hours'),
  CHECK (revoked_at IS NULL OR (isfinite(revoked_at) AND revoked_at >= created_at))
);
CREATE INDEX local_auth_sessions_user_idx ON tsa_private.local_auth_sessions (user_id, expires_at)
  WHERE user_id IS NOT NULL;
CREATE INDEX local_auth_sessions_expiry_idx ON tsa_private.local_auth_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE FUNCTION tsa_private.guard_local_auth_session() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Local authentication session history cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.csrf_hash IS DISTINCT FROM OLD.csrf_hash OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'A local session may only be revoked once' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER local_auth_sessions_append_only
  BEFORE UPDATE OR DELETE ON tsa_private.local_auth_sessions
  FOR EACH ROW EXECUTE FUNCTION tsa_private.guard_local_auth_session();

REVOKE ALL ON SCHEMA tsa_private FROM tsa_identity;
GRANT USAGE ON SCHEMA tsa TO tsa_identity;
GRANT USAGE ON SCHEMA tsa_private TO tsa_identity;
REVOKE ALL ON tsa_private.local_synthetic_environment, tsa_private.local_auth_sessions
  FROM PUBLIC, tsa_web, tsa_bank, tsa_factory, tsa_exam;
REVOKE ALL ON FUNCTION tsa_private.guard_local_auth_session() FROM PUBLIC;
GRANT SELECT ON tsa_private.local_synthetic_environment TO tsa_identity;
GRANT SELECT, INSERT, UPDATE ON tsa_private.local_auth_sessions TO tsa_identity;
GRANT SELECT ON tsa.users, tsa.user_roles TO tsa_identity;
GRANT SELECT (id, user_id, form_id, form_mode, state, personal_owner_reference)
  ON tsa.attempts TO tsa_identity;
GRANT SELECT (id, mode, owner_user_id) ON tsa.forms TO tsa_identity;

CREATE POLICY identity_owned_attempt_select ON tsa.attempts FOR SELECT TO tsa_identity
  USING (user_id::text = NULLIF(current_setting('tsa.local_user_id', true), ''));
CREATE POLICY identity_owned_form_select ON tsa.forms FOR SELECT TO tsa_identity
  USING (owner_user_id::text = NULLIF(current_setting('tsa.local_user_id', true), '')
    OR EXISTS (
      SELECT 1 FROM tsa.attempts a
       WHERE a.form_id = forms.id
         AND a.user_id::text = NULLIF(current_setting('tsa.local_user_id', true), '')
    ));

-- Bank content authoring never grants the Bank manager user or role administration.
REVOKE ALL ON tsa.users, tsa.user_roles FROM tsa_bank;
GRANT SELECT ON tsa.users, tsa.user_roles TO tsa_bank;

-- No application/service role may read session hashes or initialize the marker.
REVOKE ALL ON tsa_private.local_synthetic_environment, tsa_private.local_auth_sessions
  FROM PUBLIC, tsa_web, tsa_bank, tsa_factory, tsa_exam;

