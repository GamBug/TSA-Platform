-- Reusable image library. Readable, stable asset codes (IMG-GEO-000123) sit over the existing content-addressed
-- tsa.asset_versions. Additive: existing asset versions, question and form references and student image delivery
-- are unchanged. One library asset per distinct file (SHA-256); one asset version per security purpose, because a
-- question image and an explanation image must stay separately authorized until results are released.

CREATE TABLE tsa.image_assets (
  asset_code text PRIMARY KEY CHECK (asset_code ~ '^IMG-[A-Z][A-Z0-9]{1,7}-[0-9]{6}$'),
  content_hash text NOT NULL UNIQUE CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  media_type text NOT NULL CHECK (btrim(media_type) <> ''),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  width integer CHECK (width BETWEEN 1 AND 65535),
  height integer CHECK (height BETWEEN 1 AND 65535),
  title text CHECK (title IS NULL OR (btrim(title) <> '' AND length(title) <= 300)),
  alt_text text CHECK (alt_text IS NULL OR (btrim(alt_text) <> '' AND length(alt_text) <= 1000)),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETIRED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_at timestamptz,
  CHECK ((status = 'RETIRED') = (retired_at IS NOT NULL))
);

CREATE TABLE tsa.image_asset_versions (
  asset_version_id uuid PRIMARY KEY REFERENCES tsa.asset_versions(id) ON DELETE RESTRICT,
  asset_code text NOT NULL REFERENCES tsa.image_assets(asset_code) ON DELETE RESTRICT,
  purpose tsa.asset_security_class NOT NULL,
  UNIQUE (asset_code, purpose)
);
CREATE INDEX image_asset_versions_code_idx ON tsa.image_asset_versions (asset_code);

CREATE TABLE tsa.image_asset_counters (
  area text PRIMARY KEY CHECK (area ~ '^[A-Z][A-Z0-9]{1,7}$'),
  last_number integer NOT NULL CHECK (last_number BETWEEN 1 AND 999999)
);

CREATE FUNCTION tsa.next_image_asset_code(target_area text) RETURNS text
LANGUAGE plpgsql SET search_path = pg_catalog, tsa AS $$
DECLARE next_number integer;
BEGIN
  INSERT INTO tsa.image_asset_counters (area, last_number) VALUES (target_area, 1)
    ON CONFLICT (area) DO UPDATE SET last_number = tsa.image_asset_counters.last_number + 1
    RETURNING last_number INTO next_number;
  RETURN 'IMG-' || target_area || '-' || lpad(next_number::text, 6, '0');
END
$$;

-- Every question version that displays this asset, in any purpose, with its workflow state.
CREATE FUNCTION tsa.image_asset_references(target_code text) RETURNS TABLE(question_version_id uuid, state text)
LANGUAGE sql STABLE SET search_path = pg_catalog, tsa AS $$
  SELECT qa.question_version_id, w.state::text
    FROM tsa.image_asset_versions iv
    JOIN tsa.question_assets qa ON qa.asset_version_id = iv.asset_version_id
    JOIN tsa.question_workflow w ON w.question_version_id = qa.question_version_id
   WHERE iv.asset_code = target_code
  UNION
  SELECT q.id, w.state::text
    FROM tsa.image_asset_versions iv
    JOIN tsa.stimulus_assets sa ON sa.asset_version_id = iv.asset_version_id
    JOIN tsa.question_versions q ON q.stimulus_version_id = sa.stimulus_version_id
    JOIN tsa.question_workflow w ON w.question_version_id = q.id
   WHERE iv.asset_code = target_code
$$;

CREATE FUNCTION tsa.image_asset_in_use(target_code text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, tsa AS $$
  SELECT EXISTS (SELECT 1 FROM tsa.image_asset_references(target_code) WHERE state IN ('DRAFT', 'IN_REVIEW', 'APPROVED'))
$$;

CREATE FUNCTION tsa.guard_image_asset() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, tsa AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Image assets are never deleted; retire them instead' USING ERRCODE = '23514';
  END IF;
  -- Only ACTIVE -> RETIRED is allowed, and only when no live question still shows the image.
  IF NEW.asset_code IS DISTINCT FROM OLD.asset_code OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
     OR NEW.media_type IS DISTINCT FROM OLD.media_type OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
     OR NEW.width IS DISTINCT FROM OLD.width OR NEW.height IS DISTINCT FROM OLD.height
     OR NEW.title IS DISTINCT FROM OLD.title OR NEW.alt_text IS DISTINCT FROM OLD.alt_text
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NOT (OLD.status = 'ACTIVE' AND NEW.status = 'RETIRED') THEN
    RAISE EXCEPTION 'Image asset records are immutable except retirement' USING ERRCODE = '23514';
  END IF;
  IF tsa.image_asset_in_use(OLD.asset_code) THEN
    RAISE EXCEPTION 'Image asset % is still used by an active question and cannot be retired', OLD.asset_code USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER image_assets_guard BEFORE UPDATE OR DELETE ON tsa.image_assets
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_image_asset();
CREATE TRIGGER image_asset_versions_immutable BEFORE UPDATE OR DELETE ON tsa.image_asset_versions
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();

-- Backfill: register every existing asset version without changing it. The first version of a file gets the library
-- asset (area LEG); a second version of the same file for the other purpose becomes its twin; a further exact copy for
-- the same purpose stays valid for the questions that reference it but is not linked.
DO $backfill$
DECLARE
  item record;
  code text;
  inspection record;
BEGIN
  FOR item IN SELECT * FROM tsa.asset_versions ORDER BY created_at, id LOOP
    SELECT asset_code INTO code FROM tsa.image_assets WHERE content_hash = item.content_hash;
    IF code IS NULL THEN
      code := tsa.next_image_asset_code('LEG');
      SELECT width, height INTO inspection FROM tsa_private.asset_inspections WHERE asset_version_id = item.id;
      INSERT INTO tsa.image_assets (asset_code, content_hash, media_type, byte_size, width, height, alt_text)
        VALUES (code, item.content_hash, item.mime, item.byte_size, inspection.width, inspection.height,
                NULLIF(left(btrim(COALESCE(item.alt_metadata ->> 'alt', '')), 1000), ''));
    END IF;
    INSERT INTO tsa.image_asset_versions (asset_version_id, asset_code, purpose)
      VALUES (item.id, code, item.security_class) ON CONFLICT DO NOTHING;
  END LOOP;
END
$backfill$;

REVOKE ALL ON tsa.image_assets, tsa.image_asset_versions, tsa.image_asset_counters
  FROM PUBLIC, tsa_web, tsa_bank, tsa_factory, tsa_exam, tsa_identity, tsa_exam_worker;
GRANT SELECT ON tsa.image_assets, tsa.image_asset_versions TO tsa_bank;
REVOKE ALL ON FUNCTION tsa.next_image_asset_code(text), tsa.image_asset_references(text), tsa.image_asset_in_use(text),
  tsa.guard_image_asset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.image_asset_references(text), tsa.image_asset_in_use(text) TO tsa_bank;
