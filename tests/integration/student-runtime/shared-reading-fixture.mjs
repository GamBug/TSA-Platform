import { createBundleFixture } from '../assembly/bundle-fixtures.mjs';

/** Original disposable READING2 inventory; never retained or human-approved stock. */
export async function createSharedReadingFixture() {
  const fixture = await createBundleFixture({ section: 'READING', bundleCount: 1 });
  fixture.questions = fixture.bundles[0].questions;
  fixture.expectedOptions = ['b', 'c'];
  return fixture;
}
