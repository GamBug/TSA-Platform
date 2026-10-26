import {BlueprintConfigSchema, MvpBlueprintConfigSchema} from '../../../packages/contracts/dist/internal.js';

/** Additive local personal-only profile guard; the frozen MVP guard is unchanged. */
export function parseShortPracticeConfig(value) {
  const parsed=BlueprintConfigSchema.safeParse(value);
  if(!parsed.success)return null;
  const config=parsed.data,section=config.sections[0];
  return config.profileKind==='INDEPENDENT_PRACTICE'&&config.sections.length===1
    &&['MATH','SCIENCE'].includes(section.section)&&section.count===2&&section.durationSeconds===180
    ?config:null;
}
export function parsePersonalPracticeConfig(value,{allowShort=false}={}) {
  const original=MvpBlueprintConfigSchema.safeParse(value);
  return original.success?original.data:allowShort?parseShortPracticeConfig(value):null;
}
