-- B1.2 private inspection: a Boolean audit probe, never broad audit visibility.
CREATE FUNCTION tsa.bank_local_version_authored_by(version_id uuid, actor_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, tsa
AS $$
  SELECT $1 IS NOT NULL AND $2 IS NOT NULL
    AND count(*) = 1
    AND count(*) FILTER (WHERE event.actor_id = $2) = 1
  FROM tsa.audit_events AS event
  WHERE event.entity_type = 'question_version'
    AND event.entity_id = $1::text
    AND event.action IN ('QUESTION_DRAFT_CREATED', 'QUESTION_DRAFT_VERSION_CREATED');
$$;
REVOKE ALL ON FUNCTION tsa.bank_local_version_authored_by(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.bank_local_version_authored_by(uuid, uuid) TO tsa_bank;
