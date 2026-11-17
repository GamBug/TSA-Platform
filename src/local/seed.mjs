import { createHash } from 'node:crypto';
import { withTransaction } from '../modules/database/pool.mjs';
import { LOCAL_SYNTHETIC_ACTORS } from '../modules/identity/local-synthetic.mjs';
import { privateQuestionFixture } from '../../apps/practice-prototype/src/private-question-fixture.mjs';

export const LOCAL_TAXONOMY = Object.freeze({
  taxonomyVersionId: '10000000-0000-4000-8000-000000000001',
  domainId: '10000000-0000-4000-8000-000000000002',
  skillId: '10000000-0000-4000-8000-000000000003',
});

const SOURCE_TITLE = 'Synthetic local workspace source';
const SOURCE_CANONICAL_URI = null;
const SOURCE_ORIGIN = 'EXTERNAL';
export const LOCAL_SOURCE_VERSION_HASH = `sha256:${createHash('sha256').update(JSON.stringify(privateQuestionFixture)).digest('hex')}`;
const SOURCE_EVIDENCE_URI = 'local://track-b/synthetic-source/1';
const SOURCE_METADATA = Object.freeze({ purpose: 'synthetic local authoring fixture', rightsState: 'UNKNOWN' });
const RIGHTS_EVIDENCE = 'Synthetic local record; rights are UNKNOWN and no use permission is asserted.';

function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }

function taxonomyDefinitionHash() {
  return sha256(JSON.stringify({
    schemaVersion: 'taxonomy/1',
    taxonomyVersionId: LOCAL_TAXONOMY.taxonomyVersionId,
    name: 'Track B local synthetic taxonomy',
    versionNo: 1,
    nodes: [
      { id: LOCAL_TAXONOMY.domainId, code: 'MATH', kind: 'DOMAIN', parentId: null, metadata: {} },
      { id: LOCAL_TAXONOMY.skillId, code: 'ALGEBRA', kind: 'SKILL', parentId: LOCAL_TAXONOMY.domainId, metadata: {} },
    ],
  }));
}

/** Add or verify the tiny synthetic taxonomy without modifying existing versions. */
export async function ensureLocalTaxonomy(ownerPool) {
  const definitionHash = taxonomyDefinitionHash();
  await withTransaction(ownerPool, async (client) => {
    const version = await client.query(
      'SELECT id, name, version_no, definition_hash FROM tsa.taxonomy_versions WHERE id=$1 FOR UPDATE',
      [LOCAL_TAXONOMY.taxonomyVersionId]);
    if (version.rowCount === 0) {
      await client.query(
        `INSERT INTO tsa.taxonomy_versions (id, name, version_no, definition_hash)
         VALUES ($1, 'Track B local synthetic taxonomy', 1, $2)`,
        [LOCAL_TAXONOMY.taxonomyVersionId, definitionHash]);
      await client.query(
        `INSERT INTO tsa.taxonomy_nodes (id, taxonomy_version_id, code, kind, parent_id, metadata)
         VALUES ($1,$3,'MATH','DOMAIN',NULL,'{}'::jsonb),
                ($2,$3,'ALGEBRA','SKILL',$1,'{}'::jsonb)`,
        [LOCAL_TAXONOMY.domainId, LOCAL_TAXONOMY.skillId, LOCAL_TAXONOMY.taxonomyVersionId]);
      return;
    }
    const row = version.rows[0];
    if (row.name !== 'Track B local synthetic taxonomy' || Number(row.version_no) !== 1
        || row.definition_hash !== definitionHash) {
      throw new Error('The local synthetic taxonomy does not match its pinned definition');
    }
    const nodes = await client.query(
      `SELECT id, code, kind, parent_id, metadata
         FROM tsa.taxonomy_nodes WHERE taxonomy_version_id=$1 ORDER BY code`,
      [LOCAL_TAXONOMY.taxonomyVersionId]);
    const expected = [
      { id: LOCAL_TAXONOMY.domainId, code: 'MATH', kind: 'DOMAIN', parent_id: null, metadata: {} },
      { id: LOCAL_TAXONOMY.skillId, code: 'ALGEBRA', kind: 'SKILL', parent_id: LOCAL_TAXONOMY.domainId, metadata: {} },
    ];
    if (JSON.stringify(nodes.rows.map((node) => ({ ...node, metadata: typeof node.metadata === 'string' ? JSON.parse(node.metadata) : node.metadata })))
        !== JSON.stringify(expected.sort((a, b) => a.code.localeCompare(b.code)))) {
      throw new Error('The local synthetic taxonomy has unexpected or modified nodes');
    }
  });
  return { ...LOCAL_TAXONOMY };
}

/** Inspect existing seed records before closing the owner pool; unknown drift is never repaired. */
export async function inspectLocalSourceSeed(ownerPool) {
  const sourceResult = await ownerPool.query(
    `SELECT id, title, canonical_uri, origin, created_by
       FROM tsa.sources WHERE title=$1 AND created_by=$2 ORDER BY id`,
    [SOURCE_TITLE, LOCAL_SYNTHETIC_ACTORS.author.id]);
  if (sourceResult.rowCount > 1) throw new Error('Duplicate local synthetic source records were found');
  const source = sourceResult.rows[0] ?? null;
  if (!source) return { sourceId: null, sourceVersionId: null, decisionId: null, needsSource: true, needsVersion: true, needsRights: true };
  if (source.title !== SOURCE_TITLE || source.canonical_uri !== SOURCE_CANONICAL_URI
      || source.origin !== SOURCE_ORIGIN || source.created_by !== LOCAL_SYNTHETIC_ACTORS.author.id) {
    throw new Error('The existing local synthetic source has unexpected metadata');
  }

  const versions = await ownerPool.query(
    `SELECT id, version_no, content_hash, metadata, evidence_uri
       FROM tsa.source_versions WHERE source_id=$1 ORDER BY version_no`, [source.id]);
  if (versions.rowCount > 1) throw new Error('Unexpected versions exist for the pinned local synthetic source');
  if (versions.rowCount === 0) {
    return { sourceId: source.id, sourceVersionId: null, decisionId: null, needsSource: false, needsVersion: true, needsRights: true };
  }
  const version = versions.rows[0];
  const metadata = typeof version.metadata === 'string' ? JSON.parse(version.metadata) : version.metadata;
  if (Number(version.version_no) !== 1 || version.content_hash !== LOCAL_SOURCE_VERSION_HASH
      || version.evidence_uri !== SOURCE_EVIDENCE_URI || JSON.stringify(metadata) !== JSON.stringify(SOURCE_METADATA)) {
    throw new Error('The existing local synthetic source version has unexpected metadata');
  }

  const rights = await ownerPool.query(
    `SELECT rd.id, rd.status, rd.allowed_uses, rd.territory, rd.valid_from, rd.valid_to, rd.evidence
       FROM tsa.source_rights sr JOIN tsa.rights_decisions rd ON rd.id=sr.decision_id
      WHERE sr.source_version_id=$1`, [version.id]);
  if (rights.rowCount > 1) throw new Error('Unexpected current rights records exist for the local synthetic source');
  if (rights.rowCount === 0) {
    return { sourceId: source.id, sourceVersionId: version.id, decisionId: null, needsSource: false, needsVersion: false, needsRights: true };
  }
  const right = rights.rows[0];
  const evidence = typeof right.evidence === 'string' ? JSON.parse(right.evidence) : right.evidence;
  if (right.status !== 'UNKNOWN' || !right.allowed_uses.includes('GENERATE')
      || !right.territory.includes('LOCAL_SYNTHETIC_ONLY')
      || right.valid_to !== null || evidence?.text !== RIGHTS_EVIDENCE) {
    throw new Error('Local seed rights are no longer UNKNOWN; refusing to reinterpret or reset the record');
  }
  return {
    sourceId: source.id, sourceVersionId: version.id, decisionId: right.id,
    needsSource: false, needsVersion: false, needsRights: false,
  };
}

function responseCookies(response) {
  const values = response.headers.getSetCookie?.() ?? [];
  const session = values.find((value) => value.startsWith('tsa_local_session='));
  const csrf = values.find((value) => value.startsWith('tsa_local_csrf='));
  if (!session || !csrf) throw new Error('Local synthetic seed login did not rotate both session cookies');
  const cookiePair = (value) => value.split(';', 1)[0];
  const sessionCookie = cookiePair(session);
  const csrfCookie = cookiePair(csrf);
  return { cookies: `${sessionCookie}; ${csrfCookie}`, csrf: csrfCookie.slice(csrfCookie.indexOf('=') + 1) };
}

async function callHandler(handler, origin, pathname, { method = 'GET', cookie, csrf, key, body } = {}) {
  const headers = new Headers({ host: new URL(origin).host, origin });
  if (cookie) headers.set('cookie', cookie);
  if (csrf) headers.set('x-csrf-token', csrf);
  if (key) headers.set('idempotency-key', key);
  if (body !== undefined) headers.set('content-type', 'application/json');
  const response = await handler(new Request(`${origin}${pathname}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(`Synthetic local bootstrap request failed with ${response.status} ${payload?.error?.code ?? 'ERROR'}`);
  }
  return response.json();
}

async function startActorSession(authHandler, origin, actorKey) {
  const guest = await authHandler(new Request(`${origin}/local-auth/bootstrap`, {
    method: 'POST',
    headers: { host: new URL(origin).host, origin, 'content-type': 'application/json' },
    body: '{}',
  }));
  if (guest.status !== 201) throw new Error(`Synthetic ${actorKey} bootstrap failed (${guest.status})`);
  const guestSession = responseCookies(guest);
  const login = await authHandler(new Request(`${origin}/local-auth/login`, {
    method: 'POST',
    headers: {
      host: new URL(origin).host, origin, cookie: guestSession.cookies,
      'x-csrf-token': guestSession.csrf, 'content-type': 'application/json',
    },
    body: JSON.stringify({ actorKey }),
  }));
  if (login.status !== 200) throw new Error(`Synthetic ${actorKey} login failed (${login.status})`);
  return responseCookies(login);
}

async function endActorSession(authHandler, origin, session) {
  const response = await callHandler(authHandler, origin, '/local-auth/logout', {
    method: 'POST', cookie: session.cookies, csrf: session.csrf, body: {},
  });
  if (response.authenticated !== false) throw new Error('Synthetic seed session was not revoked');
}

/** Seed the fixed source/version/UNKNOWN rights through the real authenticated Bank routes. */
export async function ensureLocalSourceSeed({ ownerPool, authHandler, bankHandler, origin, existing }) {
  let seed = { ...existing };
  if (!seed.needsSource && !seed.needsVersion && !seed.needsRights) return seed;
  let authorSession;
  try {
    if (seed.needsSource) {
      authorSession = await startActorSession(authHandler, origin, 'author');
      const created = await callHandler(bankHandler, origin, '/api/v1/sources', {
        method: 'POST', cookie: authorSession.cookies, csrf: authorSession.csrf,
        key: 'track-b-source-seed-v1',
        body: { title: SOURCE_TITLE, canonicalUri: SOURCE_CANONICAL_URI, origin: SOURCE_ORIGIN },
      });
      seed.sourceId = created.sourceId;
      seed.needsSource = false;
    }
    if (seed.needsVersion) {
      if (!authorSession) authorSession = await startActorSession(authHandler, origin, 'author');
      const version = await callHandler(bankHandler, origin, `/api/v1/sources/${seed.sourceId}/versions`, {
        method: 'POST', cookie: authorSession.cookies, csrf: authorSession.csrf,
        key: 'track-b-source-version-seed-v1',
        body: {
          contentHash: LOCAL_SOURCE_VERSION_HASH,
          evidenceUri: SOURCE_EVIDENCE_URI,
          metadata: SOURCE_METADATA,
        },
      });
      seed.sourceVersionId = version.sourceVersionId;
      seed.needsVersion = false;
    }
  } finally {
    if (authorSession) await endActorSession(authHandler, origin, authorSession);
  }
  if (seed.needsRights) {
    const managerSession = await startActorSession(authHandler, origin, 'bankManager');
    try {
      const decision = await callHandler(bankHandler, origin, `/api/v1/source-versions/${seed.sourceVersionId}/rights`, {
        method: 'POST', cookie: managerSession.cookies, csrf: managerSession.csrf,
        key: 'track-b-source-rights-seed-v1',
        body: {
          status: 'UNKNOWN', allowedUses: ['GENERATE'], territory: ['LOCAL_SYNTHETIC_ONLY'],
          validFrom: '2026-10-19T00:00:00Z', validTo: null,
          evidence: RIGHTS_EVIDENCE, expectedRevision: 0,
        },
      });
      seed.decisionId = decision.decisionId;
      seed.needsRights = false;
    } finally {
      await endActorSession(authHandler, origin, managerSession);
    }
  }
  if (!seed.sourceId || !seed.sourceVersionId || !seed.decisionId) {
    throw new Error('The synthetic local source seed is incomplete');
  }
  return seed;
}

export function createPrivateTemplate(seed) {
  if (!seed?.sourceVersionId || !seed?.decisionId) throw new TypeError('Verified synthetic source context is required');
  return {
    taxonomyVersionId: LOCAL_TAXONOMY.taxonomyVersionId,
    domainId: LOCAL_TAXONOMY.domainId,
    skillIds: [LOCAL_TAXONOMY.skillId],
    sourceVersionId: seed.sourceVersionId,
    evidenceRefs: [seed.decisionId],
    provenance: [{ sourceVersionId: seed.sourceVersionId, span: null, transformation: 'Synthetic local manual draft fixture' }],
  };
}
