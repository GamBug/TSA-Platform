const PRIVATE_KEYS = Object.freeze([
  'answerKey', 'correctAnswer', 'explanation', 'provenance', 'provenanceIds',
  'sourceVersionId', 'questionVersionId', 'questionId', 'normalizedFingerprint',
  'contentHash', 'privateHash', 'keySnapshot', 'key_snapshot', 'explanation_snapshot',
  'reviewNotes', 'createdBy', 'generationRunId',
]);

/** Fail without retaining secret values in assertion metadata or diagnostics. */
export function assertNoPrivateData({ text, headers = [] }, privateValues, { released = false, propertyNames = true } = {}) {
  const forbidden = new Set(PRIVATE_KEYS.filter((name) => !released || !['correctAnswer', 'explanation'].includes(name)));
  const fail = () => { throw new Error('Student privacy oracle detected private data'); };
  function scanString(value) {
    if (privateValues.some((secret) => value.includes(secret))) fail();
    // Decode valid byte runs independently: an unrelated literal '%' or invalid
    // UTF-8 byte must not suppress a valid encoded canary elsewhere in the value.
    const decoded = value.replace(/(?:%[0-9a-f]{2})+/gi, (run) =>
      Buffer.from(run.slice(1).split('%').map((hex) => Number.parseInt(hex, 16))).toString('utf8'));
    if (privateValues.some((secret) => decoded.includes(secret))) fail();
  }
  function visit(value) {
    if (typeof value === 'string') { scanString(value); return; }
    if (value === null || typeof value !== 'object') return;
    for (const [name, child] of Object.entries(value)) {
      scanString(name);
      if (propertyNames && forbidden.has(name)) fail();
      visit(child);
    }
  }
  scanString(text);
  for (const [name, value] of headers) { scanString(name); scanString(value); }
  let parsed;
  try { parsed = JSON.parse(text); } catch { return; }
  visit(parsed);
}
