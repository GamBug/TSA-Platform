import {BlueprintConfigSchema, MvpBlueprintConfigSchema} from '../../../packages/contracts/dist/internal.js';
import {FULL_SIMULATION_SECTIONS} from '../../../packages/contracts/dist/simulation.js';

const READING_COGNITIVE_COUNTS = Object.freeze({ M1: 8, M2: 6, M3: 6 });

/**
 * Experimental local-only profile. Registration of the immutable blueprint
 * hash is enforced separately by the private Bank database pin.
 */
export function parseReadingExperimentConfig(value) {
  const parsed=BlueprintConfigSchema.safeParse(value);
  if(!parsed.success)return null;
  const config=parsed.data;
  if(config.profileKind!=='INDEPENDENT_PRACTICE'||config.sections.length!==1)return null;
  const section=config.sections[0];
  if(section.section!=='READING'||section.count!==20||section.durationSeconds!==1800)return null;
  const cognitive=config.quotas.filter(quota=>quota.dimension==='COGNITIVE_LEVEL');
  if(cognitive.length!==3)return null;
  for(const [level,count] of Object.entries(READING_COGNITIVE_COUNTS)){
    if(cognitive.filter(quota=>quota.sectionId===section.id&&quota.value===level
      &&quota.min===count&&quota.max===count).length!==1)return null;
  }
  return config;
}

/** Detect a 20-question reading request even when its quotas are malformed. A Reading section test is not one. */
export function isReadingExperimentCandidate(value) {
  const section=value&&typeof value==='object'&&!Array.isArray(value)
    &&Array.isArray(value.sections)&&value.sections.length===1?value.sections[0]:null;
  return section?.section==='READING'&&section.count===20&&!parseSectionTestConfig(value);
}

/** Section id that marks a single-section test; the database catalog checks the same id. */
export function sectionTestId(section) {
  return `${section.toLowerCase()}-section-test`;
}

/**
 * A single-section test at the real exam length: exactly one section with the count and time it has in the full
 * simulation, the matching section id and no quotas.
 */
export function parseSectionTestConfig(value) {
  const parsed=BlueprintConfigSchema.safeParse(value);
  if(!parsed.success)return null;
  const config=parsed.data;
  if(config.profileKind!=='INDEPENDENT_PRACTICE'||config.sections.length!==1||config.quotas.length!==0)return null;
  const section=config.sections[0];
  const real=FULL_SIMULATION_SECTIONS.find(item=>item.section===section.section);
  return real&&section.id===sectionTestId(section.section)&&section.count===real.count
    &&section.durationSeconds===real.durationSeconds?config:null;
}

/** Additive local personal-only profile guard; the frozen MVP guard is unchanged. */
export function parseShortPracticeConfig(value) {
  const parsed=BlueprintConfigSchema.safeParse(value);
  if(!parsed.success)return null;
  const config=parsed.data,section=config.sections[0];
  return config.profileKind==='INDEPENDENT_PRACTICE'&&config.sections.length===1
    &&['MATH','SCIENCE'].includes(section.section)&&section.count===2&&section.durationSeconds===180
    ?config:null;
}
export function parsePersonalPracticeConfig(value,{allowShort=false,allowReadingExperiment=false}={}) {
  const original=MvpBlueprintConfigSchema.safeParse(value);
  if(original.success)return original.data;
  const sectionTest=parseSectionTestConfig(value);
  if(sectionTest)return sectionTest;
  if(allowReadingExperiment){
    const experimental=parseReadingExperimentConfig(value);
    if(experimental)return experimental;
  }
  return allowShort?parseShortPracticeConfig(value):null;
}

/** Topic profiles are privately pinned per candidate and admitted only by their route. */
export function parseTopicPracticeConfig(value) {
  const parsed = BlueprintConfigSchema.safeParse(value);
  if (!parsed.success) return null;
  const config = parsed.data, section = config.sections[0];
  return config.name.startsWith('Topic practice/') && config.profileKind === 'INDEPENDENT_PRACTICE'
    && config.sections.length === 1 && section.id === 'topic-practice'
    && section.count >= 1 && section.count <= 100 && section.durationSeconds >= 60
    && section.durationSeconds <= 10800 && config.quotas.length === 0 ? config : null;
}
