import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runStep6 } from '../step6_llm_augment.mjs';

const dataDir = path.resolve(process.cwd(), 'data/catalog');
const step5Path = path.join(dataDir, 'step5_canonical_drafts.jsonl');
const step6Path = path.join(dataDir, 'step6_augmented_catalog.jsonl');
const progressPath = path.join(dataDir, 'step6_progress.json');

test('step6 augments eligible records and leaves excluded unchanged', async () => {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.rm(step5Path, { force: true });
  await fs.rm(step6Path, { force: true });
  await fs.rm(progressPath, { force: true });

  const step5 = [
    { canonical_id: '1', catalog_status: 'core', review_status: 'auto_approved', scientific_name: 'A', common_name: 'A', field_sources: {} },
    { canonical_id: '2', catalog_status: 'excluded', review_status: 'rejected', scientific_name: 'B', common_name: 'B', field_sources: {} },
  ];
  await fs.writeFile(step5Path, `${step5.map((x) => JSON.stringify(x)).join('\n')}\n`);

  const summary = await runStep6({
    invoke: async ({ record }) => ({ result: { description: `Desc ${record.canonical_id}`, display_notes: 'note' }, apiCalls: 1 }),
  });

  const outRaw = await fs.readFile(step6Path, 'utf8');
  const out = outRaw.trim().split('\n').map((line) => JSON.parse(line));

  assert.equal(summary.augmentedCount, 1);
  assert.equal(summary.failedCount, 0);
  assert.equal(summary.apiCallCount, 1);
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.canonical_id === '1').description, 'Desc 1');
  assert.equal(out.find((r) => r.canonical_id === '2').description, undefined);
});
