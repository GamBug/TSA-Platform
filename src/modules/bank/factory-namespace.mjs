import { jsonDigest } from './common.mjs';

export function factoryImportNamespace(pkg) {
  if (pkg.schemaVersion === 'factory-package/2') {
    return `factory/2/${jsonDigest([pkg.producerNamespace, pkg.batchKey])}`;
  }
  if (pkg.schemaVersion === 'factory-package/3' && ['manual-reading-draft/1', 'corpus-reading-draft/1'].includes(pkg.profile)) {
    return `factory/3/${jsonDigest([pkg.profile, pkg.producerNamespace, pkg.batchKey])}`;
  }
  throw new TypeError('Unsupported Factory import format');
}

export function isFactoryImportNamespace(namespace) {
  return typeof namespace === 'string' && /^factory\/[23]\/sha256:[0-9a-f]{64}$/.test(namespace);
}
