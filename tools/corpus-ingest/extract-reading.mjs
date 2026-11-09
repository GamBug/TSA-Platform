import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readReadingCorpus } from './reading-captures.mjs';
import { createPrivateOutputDirectory, writePrivateJson } from './reading-package.mjs';

export async function extractReadingCorpus(sourceRoot, outputDirectory) {
  const corpus = await readReadingCorpus(sourceRoot);
  await createPrivateOutputDirectory(outputDirectory);
  await writePrivateJson(join(outputDirectory, 'source-manifest-before.json'), corpus.manifest);
  await writePrivateJson(join(outputDirectory, 'extraction.json'), corpus);
  await writePrivateJson(join(outputDirectory, 'blind.json'), corpus.selected.map((group) => ({
    passageId: group.passageId, passage: group.passage, questions: group.items.map((item) => ({
      id: item.id, prompt: item.public.prompt, options: item.public.options })) })));
  return { captures: corpus.records.length, selectedPassages: corpus.selected.length,
    selectedItems: corpus.selected.flatMap((group) => group.items).length,
    deferredPassages: corpus.deferred.length, needsOwnerKeys: corpus.needs_owner_keys.length, cp4Types: corpus.cp4_types.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) throw new Error('Usage: extract-reading SOURCE_ROOT NEW_PRIVATE_OUTPUT_DIR');
  console.log(JSON.stringify(await extractReadingCorpus(resolve(process.argv[2]), resolve(process.argv[3]))));
}
