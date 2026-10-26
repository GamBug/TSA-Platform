import {randomUUID} from 'node:crypto';
import {createFixedFormSealingService} from '../../../src/modules/bank/fixed-form-sealing.mjs';
import {MvpBlueprintConfigSchema} from '../../../packages/contracts/dist/internal.js';

/** Original disposable stock sealed through the same trusted B9 service as staff. */
export async function seedFixedStudentForms(fixture, {windowMinutes = 60} = {}) {
  const service = await createFixedFormSealingService({bankPool:fixture.bankPool,
    identityService:fixture.identityService,enableCreation:true});
  const blueprints = fixture.domainBlueprints ? Object.values(fixture.domainBlueprints) : [fixture.blueprint];
  const forms = [];
  for (const blueprint of blueprints) {
    if (!MvpBlueprintConfigSchema.safeParse(blueprint.config).success) continue;
    const response = await service.create(fixture.principals.examManager, {mode:'PUBLISHED_FIXED',
      blueprintVersionId:blueprint.versionId,blueprintHash:blueprint.contentHash,windowMinutes}, randomUUID());
    forms.push({...response.body,domain:blueprint.config.sections[0].section});
  }
  return forms;
}
