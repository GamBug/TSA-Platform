import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { bankRequest } from '../bank/harness.mjs';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';
import { createLocalImageStore } from '../../../src/modules/media/local-image-store.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';

/** Original generated geometric pixels, never screenshots from the source corpus. */
export async function createImageFixture(t, { largeImages = false } = {}) {
  const f = await createAllocationFixture({ questionCount: 0, blueprintCount: 4 });
  const directory = await mkdtemp(join(tmpdir(), 'tsa-attempt-images-'));
  const closeDatabase = f.close;
  f.close = async () => { try { await closeDatabase(); } finally { await rm(directory, { recursive: true, force: true }); } };
  t.after(() => f.close());
  const rootDirectory = join(directory, 'objects');
  const imageStore = await createLocalImageStore({ rootDirectory, enabled: true,
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' } });
  const assets = {};
  for (const [purpose, color] of [['QUESTION', '#84292b'], ['EXPLANATION', '#254e62']]) {
    const drawing = sharp({ create: { width: largeImages ? 1200 : 120, height: largeImages ? 800 : 80, channels: 3, background: largeImages ? '#ffffff' : color } });
    if (largeImages) drawing.composite([{ input: Buffer.from(`<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg"><path d="M100 80V700H1120 M100 200H1120 M100 400H1120 M100 600H1120" fill="none" stroke="#cbd5e1" stroke-width="3"/><path d="M100 700L1080 120" fill="none" stroke="${color}" stroke-width="8"/><circle cx="600" cy="404" r="13" fill="${color}"/><text x="120" y="70" font-size="32" fill="#334155">Synthetic diagram — engineering fixture</text><text x="1080" y="750" font-size="32">x</text><text x="45" y="105" font-size="32">y</text></svg>`) }]);
    const bytes = await drawing.png().toBuffer();
    const contentHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    await imageStore.inspectAndStore({ bytes, contentHash, mediaType: 'image/png' });
    const id = randomUUID();
    await f.pool.query(`INSERT INTO tsa.asset_versions(id,source_version_id,object_key,content_hash,mime,byte_size,alt_metadata,security_class)
      VALUES($1,$2,$3,$4,'image/png',$5,'{"syntheticOnly":true}',$6)`,
    [id, f.source.sourceVersionId, `private-synthetic:${id}`, contentHash, bytes.length, purpose]);
    assets[purpose] = { id, bytes, contentHash, path: join(rootDirectory, 'sha256', contentHash.slice(7, 9), contentHash.slice(7)) };
  }
  const workflow = await createPublicationService({ bankPool: f.bankPool, identityService: f.identityService,
    fixtureScopeId: f.fixtureScopeId, imageStore });
  const template = createPrivateTemplate(f.source);
  const draft = {
    schemaVersion: 'question/1', language: 'vi-VN', section: 'MATH', taxonomyVersionId: template.taxonomyVersionId,
    domainId: template.domainId, skillIds: template.skillIds, subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
    content: [{ type: 'text', text: 'Mẫu hình tổng hợp để kiểm thử giao diện.' },
      { type: 'image', assetVersionId: assets.QUESTION.id, alt: 'Hình chữ nhật màu đỏ, mẫu kiểm thử tổng hợp.' }],
    interaction: { type: 'SINGLE_CHOICE', options: ['a', 'b'].map((id) => ({ id, content: [{ type: 'text', text: id.toUpperCase() }] })) },
    answerKey: { type: 'SINGLE_CHOICE', optionId: 'a' },
    explanation: [{ type: 'text', text: 'Lời giải riêng tư tổng hợp.' },
      { type: 'image', assetVersionId: assets.EXPLANATION.id, alt: 'Hình chữ nhật màu xanh trong lời giải tổng hợp.' }],
    stimulusVersionId: null, evidenceRefs: template.evidenceRefs, origin: 'MANUAL', provenance: template.provenance,
  };
  const response = await bankRequest(f.harness, f.browsers.author, '/api/v1/questions', { method: 'POST', key: randomUUID(), body: draft });
  const created = await response.json();
  if (response.status !== 201) throw new Error(`Image draft rejected: ${created.error?.code}`);
  Object.assign(f, { directory, imageStore, assets, imageWorkflow: workflow, imageQuestion: created });
  f.approveImage = async () => {
    await approve(created);
    for (let index = 2; index <= 4; index++) {
      const input = structuredClone(draft); input.content[0].text += ` ${index}`;
      const response = await bankRequest(f.harness, f.browsers.author, "/api/v1/questions", { method: "POST", key: randomUUID(), body: input });
      const question = await response.json();
      if (response.status !== 201) throw new Error(`Additional image draft rejected: ${question.error?.code}`);
      await approve(question);
    }
  };
  async function approve(created) {
    await workflow.submitReview(f.principals.author, created.versionId, randomUUID(), { expectedRevision: 1 });
    await workflow.confirmSingleton(f.principals.reviewer, created.versionId, randomUUID(), {
      expectedRevision: 2, contentHash: created.contentHash, reason: 'Synthetic inspected image fixture singleton.' });
    await workflow.review(f.principals.reviewer, created.versionId, randomUUID(), {
      expectedRevision: 2, contentHash: created.contentHash, decision: 'APPROVE',
      rubric: Object.fromEntries(['correctness', 'unambiguous', 'relevant', 'language', 'explanation', 'rights'].map((key) => [key, true])),
      reason: 'Synthetic technical verification only, no human publication approval.' });
  }
  return f;
}
