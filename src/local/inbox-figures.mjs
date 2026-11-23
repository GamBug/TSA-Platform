// Figures for pasted ChatGPT question sets. A question or passage that needs a figure carries an image_request block
// (request id NEW-IMG-001, ...). The owner, or ChatGPT with its Python tool, supplies the figure as an image file next
// to the pasted answer, named after the block: <question or passage id>_<request id>.png (or .jpg, .jpeg, .webp), for
// example MATH-S261122A-000031_NEW-IMG-001.png. A confirmed inbox run registers each file in the image library under the
// pasted file's own source and replaces the block with an image block, so the question imports with its real figure.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describeImage, registerImage } from '../modules/bank/image-library.mjs';

export const FIGURE_EXTENSIONS = Object.freeze(['.png', '.jpg', '.jpeg', '.webp']);
const FIGURE_FILE = /^([A-Za-z0-9-]{1,80})_(NEW-IMG-[0-9]{3,6})\.(png|jpe?g|webp)$/i;
/** Image library areas per subject: 2-8 capital letters, as the library requires. */
export const FIGURE_AREAS = Object.freeze({ MATH: 'MATH', READING: 'READ', SCIENCE: 'SCIE' });

/** The owner and request a figure file is for, or null when the name does not follow the convention. Pure. */
export function parseFigureName(name) {
  const match = FIGURE_FILE.exec(path.basename(String(name ?? '')));
  return match ? { ownerId: match[1], requestId: match[2].toUpperCase(), key: `${match[1]}_${match[2].toUpperCase()}` } : null;
}

/** True for a file name with an image extension (the inbox lists these as figures, not as pasted answers). Pure. */
export const isFigureFile = (name) => FIGURE_EXTENSIONS.includes(path.extname(String(name)).toLowerCase());

/** The file name the inbox expects for one figure. Pure. */
export const figureFileName = (ownerId, requestId) => `${ownerId}_${requestId}.png`;

function collect(value, found) {
  if (Array.isArray(value)) value.forEach((item) => collect(item, found));
  else if (value && typeof value === 'object') {
    if (value.type === 'image_request' && typeof value.request_id === 'string') found.push(value);
    else Object.values(value).forEach((item) => collect(item, found));
  }
  return found;
}

/**
 * Every image_request block of a question set with the question or passage that owns it, in document order. The
 * returned `block` is the object inside `document`, so a caller working on a copy can replace it in place. Pure.
 */
export function imageRequests(document) {
  const requests = [];
  for (const passage of Array.isArray(document?.passages) ? document.passages : []) {
    for (const block of collect(passage, [])) requests.push({ owner: 'passage', ownerId: passage.passage_id, target: passage, block });
  }
  for (const question of Array.isArray(document?.questions) ? document.questions : []) {
    for (const block of collect(question, [])) requests.push({ owner: 'question', ownerId: question.question_id, target: question, block });
  }
  return requests.map((request) => ({ ...request, requestId: request.block.request_id, key: `${request.ownerId}_${request.block.request_id}`,
    fileName: figureFileName(request.ownerId, request.block.request_id), description: String(request.block.description ?? ''), alt: String(request.block.alt ?? '') }));
}

/**
 * Match a document's image requests with the figure files of its folder and check each file decodes as a PNG, JPEG or
 * WebP image the library accepts. Writes nothing. Returns { requests, supplied, missing, problems }: `supplied` maps a
 * request key to its file, `missing` lists requests without a file, `problems` lists unreadable files.
 */
export async function matchFigures(document, figureFiles) {
  const byKey = new Map();
  for (const file of figureFiles) {
    const parsed = parseFigureName(file);
    if (parsed) byKey.set(parsed.key, file);
  }
  const requests = imageRequests(document);
  const supplied = new Map(), missing = [], problems = [];
  for (const request of requests) {
    const file = byKey.get(request.key);
    if (!file) { missing.push(request); continue; }
    try {
      await describeImage(await readFile(file));
      supplied.set(request.key, file);
    } catch (error) {
      // The figure is needed again: it is listed as missing too, so the FIGURES request asks for a new file.
      problems.push({ questionId: request.ownerId, code: 'FIGURE_INVALID', message: `${path.basename(file)}: ${error.message}. Save the figure again as a PNG of at most 2 MB and 4096 px a side` });
      missing.push({ ...request, unreadable: true });
    }
  }
  return { requests, supplied, missing, problems };
}

/**
 * Question ids whose every figure (its own and its passage's) has a usable file, so the ASSET_REQUIRED problem the
 * import plan reports for them is answered by the files. Pure.
 */
export function questionsWithAllFigures(document, match) {
  const missingOwners = new Set(match.missing.map((request) => request.ownerId));
  const ready = new Set();
  for (const question of Array.isArray(document?.questions) ? document.questions : []) {
    if (missingOwners.has(question.question_id)) continue;
    if (typeof question.passage_ref === 'string' && missingOwners.has(question.passage_ref)) continue;
    ready.add(question.question_id);
  }
  return ready;
}

/**
 * Register every supplied figure under the pasted file's source version and return a copy of the document whose
 * image_request blocks are image blocks listed in their owner's asset_refs. A byte-identical figure reuses the existing
 * library asset. Returns { document, registered: [{ key, assetCode, created }] }.
 */
export async function attachFigures(ownerPool, imageStore, { document, supplied, subject, sourceVersionId }) {
  const copy = structuredClone(document);
  const registered = [];
  for (const request of imageRequests(copy)) {
    const file = supplied.get(request.key);
    if (!file) continue;
    const result = await registerImage(ownerPool, imageStore, { bytes: await readFile(file), area: FIGURE_AREAS[subject],
      alt: request.alt.trim() || request.description.slice(0, 300) || request.key, title: request.key, sourceVersionId });
    const { block, target } = request;
    for (const key of Object.keys(block)) delete block[key];
    Object.assign(block, { type: 'image', asset_id: result.assetCode, alt: request.alt.trim() || request.key });
    target.asset_refs = Array.isArray(target.asset_refs) ? target.asset_refs : [];
    if (!target.asset_refs.includes(result.assetCode)) target.asset_refs.push(result.assetCode);
    registered.push({ key: request.key, assetCode: result.assetCode, created: result.created });
  }
  return { document: copy, registered };
}
