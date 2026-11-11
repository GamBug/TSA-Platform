// Offerings for the university demo are derived from published Bank versions only.
// A version counts as published when it is the eligible version of its question
// and the Bank's own selection gate (approval, review, rights, delivery checks)
// currently allows it. This module never approves, publishes or generates content.
import { createHash, randomUUID } from 'node:crypto';
import { canonicalize } from '../../packages/contracts/dist/internal.js';
import { FULL_SIMULATION_SECTIONS } from '../../packages/contracts/dist/simulation.js';
import { withTransaction } from '../modules/database/pool.mjs';

export const DEMO_SECTIONS = Object.freeze(['MATH', 'READING', 'SCIENCE']);
const DELIVERABLE_SCHEMA = 'question/1';
const DELIVERABLE_TYPES = Object.freeze(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP']);
// Numeric short answers are question/2 and are delivered by their own practice, never mixed with choice items.
const NUMERIC_SCHEMA = 'question/2';
const NUMERIC_TYPE = 'NUMERIC_RESPONSE';
const NUMERIC_PRACTICE = Object.freeze([
  Object.freeze({ section: 'MATH', count: 4, durationSeconds: 360, name: 'Luyện tập Toán học — trả lời số' }),
  Object.freeze({ section: 'SCIENCE', count: 4, durationSeconds: 360, name: 'Luyện tập Khoa học — trả lời số' }),
]);
const SIMULATION_REQUIRED = Object.freeze(Object.fromEntries(
  FULL_SIMULATION_SECTIONS.map((section) => [section.section, section.count])));
// Counts are fixed by the existing single-section catalog; durations follow the project demo profile.
const SECTION_PRACTICE = Object.freeze([
  Object.freeze({ section: 'MATH', count: 4, durationSeconds: 360, name: 'Luyện tập Toán học' }),
  Object.freeze({ section: 'READING', count: 2, durationSeconds: 180, name: 'Luyện tập Đọc hiểu' }),
  Object.freeze({ section: 'SCIENCE', count: 4, durationSeconds: 360, name: 'Luyện tập Khoa học' }),
]);
const SIMULATION_NAME = 'Full simulation — published items';
const OFFERING_WINDOW = "clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day'";

function contentHash(value) {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

/**
 * Choose allocation units whose sizes add up to exactly `target`.
 * Returns the chosen indexes, or null when no combination exists.
 */
export function takeExactUnits(sizes, target) {
  if (!Number.isSafeInteger(target) || target < 1) throw new RangeError('target must be a positive integer');
  const reach = new Array(target + 1).fill(null);
  reach[0] = { index: -1, previous: 0 };
  const order = sizes.map((size, index) => ({ size, index })).sort((a, b) => b.size - a.size || a.index - b.index);
  for (const { size, index } of order) {
    if (!Number.isSafeInteger(size) || size < 1) throw new RangeError('unit sizes must be positive integers');
    for (let sum = target; sum >= size; sum--) {
      if (reach[sum] === null && reach[sum - size] !== null) reach[sum] = { index, previous: sum - size };
    }
  }
  if (reach[target] === null) return null;
  const chosen = [];
  for (let sum = target; sum > 0; sum = reach[sum].previous) chosen.push(reach[sum].index);
  return chosen;
}

function emptySectionCounts() {
  return Object.fromEntries(DEMO_SECTIONS.map((section) => [section, 0]));
}

/**
 * Pure planning step. `versions` lists published versions; `bundles` maps a
 * bundle ID to its total member count (published or not).
 */
export function planDemoOfferings({ versions, bundles = new Map() }) {
  const published = emptySectionCounts();
  const otherProtocols = emptySectionCounts();
  const unitsByTaxonomy = new Map();
  const publishedBundleMembers = new Map();
  const bundleTaxonomies = new Map();
  for (const version of versions) {
    if (!DEMO_SECTIONS.includes(version.section)) throw new Error('Unexpected Bank section in published stock');
    published[version.section] += 1;
    if (version.bundleId) {
      publishedBundleMembers.set(version.bundleId, (publishedBundleMembers.get(version.bundleId) ?? 0) + 1);
      bundleTaxonomies.set(version.bundleId, (bundleTaxonomies.get(version.bundleId) ?? new Set()).add(version.taxonomyVersionId));
    }
  }
  const incompleteBundles = emptySectionCounts();
  const seenBundles = new Set();
  const numericByTaxonomy = new Map();
  for (const version of versions) {
    if (version.schemaVersion === NUMERIC_SCHEMA && version.interactionType === NUMERIC_TYPE
        && !version.bundleId && !version.stimulusVersionId) {
      const counts = numericByTaxonomy.get(version.taxonomyVersionId) ?? emptySectionCounts();
      counts[version.section] += 1;
      numericByTaxonomy.set(version.taxonomyVersionId, counts);
      continue;
    }
    if (version.schemaVersion !== DELIVERABLE_SCHEMA || !DELIVERABLE_TYPES.includes(version.interactionType)) {
      otherProtocols[version.section] += 1;
      continue;
    }
    let size;
    if (version.bundleId) {
      // A shared-passage bundle is delivered whole or not at all.
      if (publishedBundleMembers.get(version.bundleId) !== bundles.get(version.bundleId)
          || bundleTaxonomies.get(version.bundleId).size !== 1) {
        incompleteBundles[version.section] += 1;
        continue;
      }
      if (seenBundles.has(version.bundleId)) continue;
      seenBundles.add(version.bundleId);
      size = bundles.get(version.bundleId);
    } else if (version.stimulusVersionId) {
      incompleteBundles[version.section] += 1;
      continue;
    } else {
      size = 1;
    }
    const taxonomy = unitsByTaxonomy.get(version.taxonomyVersionId) ?? Object.fromEntries(DEMO_SECTIONS.map((section) => [section, []]));
    taxonomy[version.section].push(size);
    unitsByTaxonomy.set(version.taxonomyVersionId, taxonomy);
  }

  const taxonomies = [...unitsByTaxonomy.entries()].map(([taxonomyVersionId, units]) => {
    const deliverable = Object.fromEntries(DEMO_SECTIONS.map((section) => [section, units[section].reduce((a, b) => a + b, 0)]));
    // Count complete, non-overlapping simulations. One exact subset is taken per round, so with
    // mixed bundle sizes this is a lower bound; with standalone items it is exact.
    const remaining = Object.fromEntries(DEMO_SECTIONS.map((section) => [section, [...units[section]]]));
    let simulations = 0;
    for (;;) {
      const picks = DEMO_SECTIONS.map((section) => takeExactUnits(remaining[section], SIMULATION_REQUIRED[section]));
      if (picks.some((pick) => pick === null)) break;
      DEMO_SECTIONS.forEach((section, position) => {
        const used = new Set(picks[position]);
        remaining[section] = remaining[section].filter((_, index) => !used.has(index));
      });
      simulations += 1;
    }
    return { taxonomyVersionId, units, deliverable, simulations };
  }).sort((a, b) => b.simulations - a.simulations
    || DEMO_SECTIONS.reduce((sum, s) => sum + b.deliverable[s], 0) - DEMO_SECTIONS.reduce((sum, s) => sum + a.deliverable[s], 0)
    || a.taxonomyVersionId.localeCompare(b.taxonomyVersionId));

  const best = taxonomies[0] ?? null;
  const deliverable = best ? best.deliverable : emptySectionCounts();
  const withoutRepeats = best?.simulations ?? 0;
  const shortages = DEMO_SECTIONS
    .filter((section) => deliverable[section] < SIMULATION_REQUIRED[section])
    .map((section) => ({ section, required: SIMULATION_REQUIRED[section], available: deliverable[section] }));
  const combined = Object.fromEntries(DEMO_SECTIONS.map((section) => [section,
    taxonomies.reduce((sum, taxonomy) => sum + taxonomy.deliverable[section], 0)]));
  const splitAcrossTaxonomies = withoutRepeats === 0 && taxonomies.length > 1
    && DEMO_SECTIONS.every((section) => combined[section] >= SIMULATION_REQUIRED[section]);

  const sectionPractice = SECTION_PRACTICE.map((profile) => {
    const candidate = taxonomies
      .filter((taxonomy) => takeExactUnits(taxonomy.units[profile.section], profile.count) !== null)
      .sort((a, b) => b.deliverable[profile.section] - a.deliverable[profile.section]
        || a.taxonomyVersionId.localeCompare(b.taxonomyVersionId))[0] ?? null;
    return { section: profile.section, required: profile.count, durationSeconds: profile.durationSeconds, name: profile.name,
      available: candidate ? candidate.deliverable[profile.section]
        : Math.max(0, ...taxonomies.map((taxonomy) => taxonomy.deliverable[profile.section])),
      offered: candidate !== null, taxonomyVersionId: candidate?.taxonomyVersionId ?? null };
  });

  const numericPractice = NUMERIC_PRACTICE.map((profile) => {
    const ranked = [...numericByTaxonomy.entries()].sort(([leftId, left], [rightId, right]) =>
      right[profile.section] - left[profile.section] || leftId.localeCompare(rightId));
    const [taxonomyVersionId, counts] = ranked[0] ?? [null, emptySectionCounts()];
    const available = counts[profile.section];
    const offered = available >= profile.count;
    return { section: profile.section, required: profile.count, durationSeconds: profile.durationSeconds, name: profile.name,
      available, offered, taxonomyVersionId: offered ? taxonomyVersionId : null };
  });
  const numericStock = emptySectionCounts();
  for (const counts of numericByTaxonomy.values()) for (const section of DEMO_SECTIONS) numericStock[section] += counts[section];

  return {
    published, deliverable, otherProtocols, incompleteBundles, numericStock, numericPractice,
    fullSimulation: { offered: withoutRepeats > 0, withoutRepeats, taxonomyVersionId: withoutRepeats > 0 ? best.taxonomyVersionId : null,
      required: { ...SIMULATION_REQUIRED }, shortages, splitAcrossTaxonomies },
    sectionPractice,
    topicPractice: { available: DEMO_SECTIONS.some((section) => combined[section] > 0) },
  };
}

async function readStock(client) {
  // question/2 counts as selectable only while the numeric-practice setting is on, as it is when students are served.
  await client.query("SELECT set_config('tsa.enable_numeric_practice','true',true)");
  const versions = (await client.query(`
    SELECT v.id, v.taxonomy_version_id AS "taxonomyVersionId", v.section::text AS section,
           v.schema_version AS "schemaVersion", v.interaction->>'type' AS "interactionType",
           v.stimulus_version_id AS "stimulusVersionId", bm.bundle_id AS "bundleId"
      FROM tsa.questions q
      JOIN tsa.question_versions v ON v.id=q.eligible_version_id
      LEFT JOIN tsa.bundle_members bm ON bm.question_version_id=v.id
     WHERE tsa.bank_question_selection_allowed(v.id)
     ORDER BY v.id`)).rows;
  const bundleRows = (await client.query(
    'SELECT bundle_id AS id, count(*)::integer AS size FROM tsa.bundle_members GROUP BY bundle_id')).rows;
  const workflow = (await client.query(`
    SELECT v.section::text AS section, w.state::text AS state, count(*)::integer AS count
      FROM tsa.question_versions v JOIN tsa.question_workflow w ON w.question_version_id=v.id
     GROUP BY 1,2 ORDER BY 1,2`)).rows;
  return { versions, bundles: new Map(bundleRows.map((row) => [row.id, row.size])), workflow };
}

async function insertOffering(client, { schemaVersion, taxonomyVersionId, config }) {
  const id = randomUUID(), versionId = randomUUID();
  await client.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, `uni-demo/${id}`]);
  await client.query(`INSERT INTO tsa.blueprint_versions
    (id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,$4,$5::jsonb,$6)`,
  [versionId, id, taxonomyVersionId, schemaVersion, JSON.stringify(config), contentHash(config)]);
  await client.query(`INSERT INTO tsa.blueprint_offerings
    (blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
    VALUES($1,true,${OFFERING_WINDOW},600)`, [versionId]);
  return versionId;
}

/**
 * Replace the demo copy's offerings with profiles that published stock can fill.
 * Run only against a disposable demo database, with the migration owner pool.
 */
export async function seedUniDemoOfferings(ownerPool) {
  return withTransaction(ownerPool, async (client) => {
    const { versions, bundles, workflow } = await readStock(client);
    const plan = planDemoOfferings({ versions, bundles });
    // Inherited offerings were not derived from published stock; the demo shows only its own.
    const disabled = await client.query(
      'UPDATE tsa.blueprint_offerings SET enabled=false,revision=revision+1,updated_at=clock_timestamp() WHERE enabled');
    const base = { evidenceIds: ['uni-demo-published-stock/1'], quotas: [], maxPerSource: null, excludedQuestionIds: [],
      bundlePolicy: 'ALL_OR_NONE', scoringPolicy: 'practice-binary-v1', releasePolicy: 'after-grade-v1' };
    const offerings = [];
    if (plan.fullSimulation.offered) {
      const taxonomyVersionId = plan.fullSimulation.taxonomyVersionId;
      const blueprintVersionId = await insertOffering(client, { schemaVersion: 'blueprint/3', taxonomyVersionId, config: {
        ...base, schemaVersion: 'blueprint/3', name: SIMULATION_NAME, taxonomyVersionId, profileKind: 'FULL_SIMULATION',
        sections: FULL_SIMULATION_SECTIONS.map((section) => ({ ...section })), allowedTypes: [...DELIVERABLE_TYPES] } });
      offerings.push({ kind: 'FULL_SIMULATION', blueprintVersionId, taxonomyVersionId });
    }
    for (const profile of plan.sectionPractice) {
      if (!profile.offered) continue;
      const blueprintVersionId = await insertOffering(client, { schemaVersion: 'blueprint/1', taxonomyVersionId: profile.taxonomyVersionId, config: {
        ...base, schemaVersion: 'blueprint/1', name: profile.name, taxonomyVersionId: profile.taxonomyVersionId,
        profileKind: 'INDEPENDENT_PRACTICE', allowedTypes: [...DELIVERABLE_TYPES],
        sections: [{ id: `${profile.section.toLowerCase()}-practice`, section: profile.section,
          count: profile.required, durationSeconds: profile.durationSeconds }] } });
      offerings.push({ kind: 'SECTION_PRACTICE', section: profile.section, blueprintVersionId, taxonomyVersionId: profile.taxonomyVersionId });
    }
    for (const profile of plan.numericPractice) {
      if (!profile.offered) continue;
      const config = { ...base, schemaVersion: 'blueprint/2', name: profile.name, taxonomyVersionId: profile.taxonomyVersionId,
        profileKind: 'INDEPENDENT_PRACTICE', scoringPolicy: 'practice-binary-v2', allowedTypes: [NUMERIC_TYPE],
        sections: [{ id: `${profile.section.toLowerCase()}-numeric-practice`, section: profile.section,
          count: profile.required, durationSeconds: profile.durationSeconds }] };
      const blueprintVersionId = await insertOffering(client, { schemaVersion: 'blueprint/2', taxonomyVersionId: profile.taxonomyVersionId, config });
      // The private pin is what makes a blueprint/2 offering deliverable; it is bound to the exact config hash.
      await client.query('INSERT INTO tsa_private.numeric_practice_profiles(blueprint_version_id,blueprint_hash) VALUES($1,$2)',
        [blueprintVersionId, contentHash(config)]);
      offerings.push({ kind: 'NUMERIC_PRACTICE', section: profile.section, blueprintVersionId, taxonomyVersionId: profile.taxonomyVersionId });
    }
    const approved = Object.fromEntries(DEMO_SECTIONS.map((section) => [section,
      workflow.find((row) => row.section === section && row.state === 'APPROVED')?.count ?? 0]));
    return { schemaVersion: 'uni-demo-stock/1', ...plan, approved, workflow, offerings, inheritedOfferingsDisabled: disabled.rowCount };
  });
}
