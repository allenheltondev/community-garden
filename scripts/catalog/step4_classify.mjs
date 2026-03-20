import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { PATHS } from './lib/config.mjs';
import { readJsonl, appendJsonl, computeChecksum } from './lib/io.mjs';
import { readProgress, writeProgress, verifyChecksum, resetProgress } from './lib/progress.mjs';

function classify(rec) {
  const warnings = rec.normalized?.warnings || [];
  const utility = rec.normalized?.utility || [];
  const edible = rec.normalized?.edible;

  const warningText = warnings.join(' ').toLowerCase();
  const utilityText = utility.join(' ').toLowerCase();

  let relevance_class = 'non_food';
  if (/weed|invasive/.test(warningText)) relevance_class = 'weed_or_invasive';
  else if (/fiber|oil|textile/.test(utilityText)) relevance_class = 'industrial_crop';
  else if (edible === true) relevance_class = 'food_crop_niche';

  const catalog_status = relevance_class === 'food_crop_core'
    ? 'core'
    : (relevance_class === 'food_crop_niche' || relevance_class === 'edible_ornamental')
      ? 'extended'
      : relevance_class === 'medicinal_only'
        ? 'hidden'
        : 'excluded';

  const source_confidence = Math.max(0, Math.min(1, Number(rec.match_score ?? 0)));
  const source_agreement_score = rec.match_type === 'unresolved' ? 0 : 0.7;

  const review_status =
    catalog_status === 'excluded' && (relevance_class === 'weed_or_invasive' || relevance_class === 'non_food')
      ? 'rejected'
      : (source_confidence >= 0.7 && source_agreement_score >= 0.6 ? 'auto_approved' : 'needs_review');

  return {
    ...rec,
    relevance_class,
    catalog_status,
    edibility_status: edible === true ? 'food_crop' : 'unknown',
    review_status,
    source_confidence,
    source_agreement_score,
    classification_reason: `Auto classified by baseline rules (${relevance_class})`,
  };
}

export async function runStep4({ reset = false, dryRun = false, limit = null } = {}) {
  if (!fs.existsSync(PATHS.step3)) throw new Error(`Missing required input from Step 3: ${PATHS.step3}`);
  if (reset) await resetProgress(4);

  const checksum = await computeChecksum(PATHS.step3);
  await verifyChecksum(4, checksum);

  const input = [];
  for await (const r of readJsonl(PATHS.step3)) input.push(r);

  const progress = await readProgress(4);
  const startIndex = progress ? progress.lastProcessedIndex + 1 : 0;
  const slice = input.slice(startIndex, limit ? startIndex + limit : undefined);

  const out = slice.map(classify);

  if (!dryRun) {
    await fsp.mkdir('data/catalog', { recursive: true });
    await appendJsonl(PATHS.step4, out);
    if (out.length > 0) await writeProgress(4, startIndex + out.length - 1, checksum);
  }

  return { processedThisRun: out.length };
}
