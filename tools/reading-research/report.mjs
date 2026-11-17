import { TAXONOMY } from './parser.mjs';
const tally = values => Object.fromEntries([...new Set(values)].sort().map(k => [k, values.filter(v => v === k).length]));
export function aggregate(captures) {
  const valid = captures.filter(c => c.extraction), qs = valid.flatMap(c => c.extraction.questions);
  const groups = new Map();
  for (const c of valid) for (const p of c.extraction.passages) {
    if (!p.text) continue;
    const g = groups.get(p.normalizedHash) ?? [];
    g.push({ captureHash: c.sha256, passageId: p.id, exactHash: p.exactHash }); groups.set(p.normalizedHash, g);
  }
  const lengths = valid.flatMap(c => c.extraction.passages.map(p => p.metrics.whitespaceSegments));
  const stemLengths = qs.map(q => q.metrics.stem.whitespaceSegments);
  const questionIds = qs.map(q => q.id); // IDs are capture-local; never global identities.
  return { schemaVersion: 'reading-research-summary/1', status: 'VERIFIED_COUNTS_OF_UNREVIEWED_EXTRACTION',
    representativeness: 'NOT_ESTABLISHED', captureCount: captures.length, decodedCaptures: valid.length,
    questionCount: questionIds.length, markedAnswerCount: qs.filter(q => q.markedAnswer || q.markedTruthValues).length,
    warningCount: captures.filter(c => !c.extraction).reduce((n, c) => n + (c.warnings?.length ?? 0), 0) + valid.reduce((n, c) => n + c.extraction.warnings.length + c.extraction.questions.reduce((a, q) => a + q.warnings.length, 0), 0),
    questionCharacteristics: { stemSegmentsMin: stemLengths.length ? Math.min(...stemLengths) : null, stemSegmentsMax: stemLengths.length ? Math.max(...stemLengths) : null, optionCountDistribution: tally(qs.map(q => String(q.options.length))) },
    interactionCounts: tally(qs.map(q => q.analysis.interaction.proposed)), skillCueCounts: tally(qs.flatMap(q => q.analysis.skills)),
    cognitiveProposalCounts: tally(qs.map(q => q.analysis.cognitive.proposed ?? 'UNKNOWN')),
    passageSegments: { method: 'unicode-whitespace-segments/1 (not linguistic words or model tokens)',
      min: lengths.length ? Math.min(...lengths) : null, max: lengths.length ? Math.max(...lengths) : null },
    uniqueNormalizedPassages: groups.size,
    sharedPassages: [...groups].filter(([, v]) => v.length > 1).map(([normalizedHash, occurrences]) => ({ normalizedHash, occurrences })),
    duplicateCaution: 'Counts are capture occurrences, not unique bank questions. Shared text does not establish question equivalence. Near matches require manual review.',
    distractorSignalCounts: tally(qs.flatMap(q => q.analysis.distractors.flatMap(d => d.signals))),
    taxonomy: TAXONOMY.map(({ skill, level, pattern }) => ({ skill, provisionalLevel: level, pattern, status: 'ASSUMPTION_UNCALIBRATED' })) };
}
export function renderReport(s) {
  return `# Private Reading capture research report\n\nStatus: ${s.status}. Representativeness: ${s.representativeness}.\n\n` +
    `Analyzed ${s.captureCount} captures (${s.decodedCaptures} decoded), ${s.questionCount} question occurrences, ${s.uniqueNormalizedPassages} distinct normalized passages. ${s.markedAnswerCount} questions have explicit, unverified answer markers. Review flags: ${s.warningCount}.\n\n` +
    `Question characteristics: ${JSON.stringify(s.questionCharacteristics)}.\n\nInteraction proposals: ${JSON.stringify(s.interactionCounts)}. Cognitive proposals: ${JSON.stringify(s.cognitiveProposalCounts)}. Skill cues: ${JSON.stringify(s.skillCueCounts)}. Distractor signals: ${JSON.stringify(s.distractorSignalCounts)}.\n\n` +
    `Passage length: ${JSON.stringify(s.passageSegments)}. Repeated passage groups: ${s.sharedPassages.length}.\n\n` +
    `All analytical labels are ASSUMPTION, based on lexical rules. M1/M2/M3 are not measured difficulty. No explanations, evidence or keys were generated. Empty extraction is not a successful parse. Review raw bytes and line spans before using counts. ${s.duplicateCaution}\n\n` +
    `No population-level pattern or official examination rule follows from these captures. Rights are operator declarations, not independently verified. Structural reports omit source text but remain private pending disclosure review.\n`;
}
export function generationGuide(s) {
  return `# Provisional LLM Reading question-generation specification\n\n` +
    `Version: reading-structural-guide/1. Status: ASSUMPTION / REQUIRES_HUMAN_VALIDATION. Based on ${s.captureCount} captures and ${s.questionCount} unreviewed question occurrences; representativeness NOT_ESTABLISHED.\n\n` +
    `## Inputs and rights\n\nUse a separately authorized original or rights-eligible passage, a pinned taxonomy, requested count, explicit supported interaction types and intended cognition mix. Do not include imported captures or source excerpts in a model prompt without separate explicit upload authorization. This file contains no source excerpts. Do not imitate distinctive wording or reconstruct a third-party bank. No weight training is authorized.\n\n` +
    `## Candidate output\n\nFollow existing question/1 and Reading Factory DraftOutputSchema, not research metadata. Return original stem, supported interaction/options, answer key, explanation, registered skillId, intended cognitiveLevel, exact passage UTF-16 [start,end) evidence quote/rationale, and a reason for each distractor. Missing evidence or ambiguous answers must fail generation validation, never be filled by guesswork. The existing ten-question 4:3:3 Factory bundle is a project setting, not an observed requirement. Research permits unknown fields; Bank candidates do not.\n\n` +
    `## Pattern menu\n\n` + s.taxonomy.map(t => `- ${t.skill}: ${t.pattern} Provisional ${t.provisionalLevel}; manually assess actual reasoning demand.`).join('\n') +
    `\n\nM1: locate explicit information. M2: integrate, interpret or infer from evidence. M3: evaluate competing claims or reasoning with evidence and limitations. Do not assign levels from verbs alone. Require a human rationale and retain uncertainty. No target frequencies can be justified from this pilot. Observed lexical counts are in summary.json.\n\n` +
    `## Distractor design\n\nIndependently review plausible alternatives for scope shifts, reversed relationships, unsupported inference, nearby-detail confusion and contextually wrong meanings. These are proposed authoring techniques, not verified observations in this dataset. Lexical overlap, negation and absolute-word signals are triage only. Avoid making every distractor obviously false, longer correct options, answer-position patterns and copied source-bank alternatives.\n\n` +
    `## Validation and release\n\nRequire schema/ID validation, exact evidence matching, independent blinded answer attempt, ambiguity and duplicate checks, human correctness/cognition/distractor/rights review, then existing DRAFT import and publication gates. Exact substring evidence does not prove entailment. TEXT_ENTRY, matching and ordering remain outside question/1; do not convert them or extend shared contracts for this research. Never upload captures, publish a research artifact or import it into Bank through this tool.\n`;
}
