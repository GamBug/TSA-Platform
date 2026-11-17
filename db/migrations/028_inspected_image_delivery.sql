-- Additive image evidence. Existing text-only checks and snapshots are retained.
ALTER TABLE tsa_private.question_delivery_checks DROP CONSTRAINT question_delivery_checks_profile_check;
ALTER TABLE tsa_private.question_delivery_checks ADD CONSTRAINT question_delivery_checks_profile_check
  CHECK(profile IN ('text-math-table/1','text-math-table-inspected-image/2'));

CREATE TABLE tsa_private.asset_inspections (
  asset_version_id uuid PRIMARY KEY REFERENCES tsa.asset_versions(id),
  content_hash text NOT NULL CHECK(content_hash ~ '^sha256:[0-9a-f]{64}$'),
  media_type text NOT NULL CHECK(media_type IN ('image/png','image/jpeg','image/webp')),
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 2097152),
  width integer NOT NULL CHECK(width BETWEEN 1 AND 4096),
  height integer NOT NULL CHECK(height BETWEEN 1 AND 4096),
  decoder_version text NOT NULL CHECK(decoder_version='image-inspection/1:sharp/0.35.5:libvips/8.18.7'),
  inspected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(width::bigint*height<=4194304)
);
CREATE TRIGGER asset_inspections_immutable BEFORE UPDATE OR DELETE ON tsa_private.asset_inspections
 FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
REVOKE ALL ON tsa_private.asset_inspections FROM PUBLIC,tsa_web,tsa_bank,tsa_factory,tsa_exam,tsa_identity,tsa_exam_worker;
GRANT SELECT,INSERT ON tsa_private.asset_inspections TO tsa_bank;

CREATE FUNCTION tsa.bank_asset_inspected(target_asset uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT EXISTS(SELECT 1 FROM tsa.asset_versions a JOIN tsa_private.asset_inspections i
  ON i.asset_version_id=a.id AND i.content_hash=a.content_hash AND i.media_type=a.mime AND i.byte_size=a.byte_size
  WHERE a.id=target_asset)
$$;

CREATE OR REPLACE FUNCTION tsa.bank_question_delivery_allowed(version_id uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT EXISTS(SELECT 1 FROM tsa_private.question_delivery_checks c JOIN tsa.question_versions q
  ON q.id=c.question_version_id AND q.content_hash=c.input_hash WHERE q.id=version_id AND
  (c.profile='text-math-table/1' OR (c.profile='text-math-table-inspected-image/2'
   AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_ancestors(version_id) ancestor
    JOIN tsa.question_assets qa ON qa.question_version_id=ancestor.id WHERE NOT tsa.bank_asset_inspected(qa.asset_version_id))
   AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_ancestors(version_id) ancestor
    JOIN tsa.question_versions qv ON qv.id=ancestor.id JOIN tsa.stimulus_assets sa ON sa.stimulus_version_id=qv.stimulus_version_id
    WHERE NOT tsa.bank_asset_inspected(sa.asset_version_id)))))
 AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_ancestors(version_id) a JOIN tsa.question_workflow w ON w.question_version_id=a.id WHERE w.state='QUARANTINED')
 AND EXISTS(SELECT 1 FROM tsa.bank_question_sources(version_id))
 AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_sources(version_id) s WHERE NOT tsa.bank_source_display_allowed(s.id))
$$;

-- Resolve references in sealed content, including option/statement/stimulus blocks.
CREATE FUNCTION tsa.snapshot_image_ids(payload jsonb) RETURNS TABLE(id uuid)
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT DISTINCT (block->>'assetVersionId')::uuid FROM jsonb_path_query(payload,
  'strict $.** ? (@.type == "image")') block
$$;

-- Runs during the existing seal transaction, without changing solver or hash bytes.
CREATE FUNCTION tsa.seal_snapshot_assets() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE item record;
BEGIN
 FOR item IN
  SELECT refs.id,'QUESTION'::tsa.question_asset_purpose AS purpose
   FROM tsa.form_slots slot CROSS JOIN LATERAL tsa.snapshot_image_ids(slot.public_snapshot) refs
   WHERE slot.form_id=NEW.form_id AND slot.slot_id=NEW.slot_id
  UNION SELECT refs.id,'EXPLANATION'::tsa.question_asset_purpose
   FROM tsa.snapshot_image_ids(NEW.explanation_snapshot) refs
 LOOP
  IF NOT tsa.bank_asset_inspected(item.id) OR NOT EXISTS(SELECT 1 FROM tsa.asset_versions a
   WHERE a.id=item.id AND a.security_class::text=item.purpose::text) THEN
   RAISE EXCEPTION 'Inspected asset membership required' USING ERRCODE='23514';
  END IF;
  INSERT INTO tsa.form_assets(form_id,asset_version_id,purpose) VALUES(NEW.form_id,item.id,item.purpose)
   ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NULL;
END;
$$;
CREATE TRIGGER seal_snapshot_assets AFTER INSERT ON tsa_private.form_slot_secrets
 FOR EACH ROW EXECUTE FUNCTION tsa.seal_snapshot_assets();

CREATE OR REPLACE FUNCTION tsa.bank_form_delivery_allowed(target_form uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT EXISTS(SELECT 1 FROM tsa.forms WHERE id=target_form)
 AND NOT EXISTS(SELECT 1 FROM tsa_private.form_delivery_holds WHERE form_id=target_form)
 AND EXISTS(SELECT 1 FROM tsa.form_availability WHERE form_id=target_form AND withdrawn_at IS NULL)
 AND EXISTS(SELECT 1 FROM tsa.form_slots WHERE form_id=target_form)
 AND NOT EXISTS(SELECT 1 FROM tsa.form_slots WHERE form_id=target_form AND NOT tsa.bank_question_delivery_allowed(question_version_id))
 AND NOT EXISTS(SELECT 1 FROM tsa.form_assets fa JOIN tsa.asset_versions av ON av.id=fa.asset_version_id
  WHERE fa.form_id=target_form AND (NOT tsa.bank_asset_inspected(av.id) OR av.security_class::text<>fa.purpose::text
   OR NOT tsa.bank_source_display_allowed(av.source_version_id)))
 AND NOT EXISTS(SELECT 1 FROM tsa.form_slots slot CROSS JOIN LATERAL tsa.snapshot_image_ids(slot.public_snapshot) refs
  WHERE slot.form_id=target_form AND NOT EXISTS(SELECT 1 FROM tsa.form_assets fa
   WHERE fa.form_id=target_form AND fa.asset_version_id=refs.id AND fa.purpose='QUESTION'))
 AND NOT EXISTS(SELECT 1 FROM tsa_private.form_slot_secrets slot CROSS JOIN LATERAL tsa.snapshot_image_ids(slot.explanation_snapshot) refs
  WHERE slot.form_id=target_form AND NOT EXISTS(SELECT 1 FROM tsa.form_assets fa
   WHERE fa.form_id=target_form AND fa.asset_version_id=refs.id AND fa.purpose='EXPLANATION'))
$$;

-- Same Bank -> attempt -> form ordering as the existing student read operation.
-- The service calls twice around a bounded local read in this transaction.
CREATE FUNCTION tsa.exam_attempt_asset(target_attempt uuid,target_asset uuid,asset_purpose text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE a record; allowed_release boolean; found_asset record;
BEGIN
 IF asset_purpose NOT IN ('question','explanation') OR asset_purpose IS NULL THEN RETURN NULL; END IF;
 IF NOT tsa.exam_reconcile_attempt(target_attempt) THEN RETURN NULL; END IF;
 SELECT * INTO a FROM tsa.attempts WHERE id=target_attempt AND user_id=tsa.assembly_candidate();
 allowed_release:=a.state='GRADED' AND EXISTS(SELECT 1 FROM tsa.result_releases r JOIN tsa.score_runs s
  ON s.id=r.score_run_id AND s.attempt_id=r.attempt_id AND s.policy_version=r.policy_version
  WHERE r.attempt_id=a.id AND r.score_run_id=a.latest_score_id AND r.revoked_at IS NULL AND s.policy_version='practice-binary-v1');
 IF NOT allowed_release AND (asset_purpose<>'question' OR a.state<>'IN_PROGRESS' OR clock_timestamp()>=a.deadline_at) THEN RETURN NULL; END IF;
 IF NOT tsa.bank_form_delivery_allowed(a.form_id) THEN RETURN NULL; END IF;
 SELECT av.content_hash,av.mime,av.byte_size INTO found_asset
  FROM tsa.form_assets fa JOIN tsa.asset_versions av ON av.id=fa.asset_version_id
  WHERE fa.form_id=a.form_id AND fa.asset_version_id=target_asset
   AND fa.purpose::text=upper(asset_purpose) AND av.security_class::text=upper(asset_purpose)
   AND tsa.bank_asset_inspected(av.id) AND tsa.bank_source_display_allowed(av.source_version_id)
   AND EXISTS(SELECT 1 FROM tsa.form_slots slot JOIN tsa_private.form_slot_secrets secret
    ON secret.form_id=slot.form_id AND secret.slot_id=slot.slot_id
    WHERE slot.form_id=a.form_id AND (allowed_release OR EXISTS(SELECT 1 FROM tsa.attempt_sections section
     WHERE section.attempt_id=a.id AND section.section_id=slot.section_id
      AND section.starts_at<=clock_timestamp() AND clock_timestamp()<section.ends_at))
    AND EXISTS(SELECT 1 FROM tsa.snapshot_image_ids(CASE WHEN asset_purpose='question'
     THEN slot.public_snapshot ELSE secret.explanation_snapshot END) refs WHERE refs.id=target_asset));
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('contentHash',found_asset.content_hash,'mediaType',found_asset.mime,'byteSize',found_asset.byte_size);
END;
$$;
REVOKE ALL ON FUNCTION tsa.bank_asset_inspected(uuid),tsa.snapshot_image_ids(jsonb),tsa.seal_snapshot_assets(),tsa.exam_attempt_asset(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.bank_asset_inspected(uuid) TO tsa_bank;
GRANT EXECUTE ON FUNCTION tsa.exam_attempt_asset(uuid,uuid,text) TO tsa_exam;
