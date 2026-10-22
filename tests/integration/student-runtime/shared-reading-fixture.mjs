import { createBundleFixture } from '../assembly/bundle-fixtures.mjs';

/** Original disposable READING2 inventory; never retained or human-approved stock. */
export async function createSharedReadingFixture({ durationSeconds = 180, bundleCount = 1 } = {}) {
  const fixture = await createBundleFixture({ section: 'READING', bundleCount, durationSeconds });
  fixture.questions = fixture.bundles[0].questions;
  fixture.expectedOptions = ['b', 'c'];
  return fixture;
}
