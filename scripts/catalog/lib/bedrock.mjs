import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromSSO } from '@aws-sdk/credential-providers';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createBedrockClient({ region = process.env.AWS_REGION || 'us-east-1', client, profile } = {}) {
  if (client) return client;
  const opts = { region };
  if (profile) opts.credentials = fromSSO({ profile });
  return new BedrockRuntimeClient(opts);
}

export function parseModelJson(text) {
  if (!text) throw new Error('Empty model response');
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('Model response is not an object');
    return parsed;
  } catch (error) {
    throw new Error(`Invalid model JSON: ${error.message}`);
  }
}

export function validateAugmentationSchema(payload = {}) {
  const VALID_CATEGORIES = new Set(['fruit', 'fruit_tree', 'fruit_shrub', 'vegetable', 'leafy_green', 'root_tuber', 'herb', 'grain', 'nut_seed', 'edible_flower', 'legume']);
  const VALID_LIFE_CYCLES = new Set(['annual', 'biennial', 'perennial']);

  const desc = typeof payload.description === 'string' && payload.description.trim() ? payload.description.trim() : null;
  const cat = typeof payload.category === 'string' && VALID_CATEGORIES.has(payload.category.trim().toLowerCase()) ? payload.category.trim().toLowerCase() : null;
  const lc = typeof payload.life_cycle === 'string' && VALID_LIFE_CYCLES.has(payload.life_cycle.trim().toLowerCase()) ? payload.life_cycle.trim().toLowerCase() : null;
  const hz = Array.isArray(payload.hardiness_zones) ? payload.hardiness_zones.filter((z) => typeof z === 'string' && /^\d{1,2}[ab]?$/.test(z.trim())).map((z) => z.trim()) : [];

  return {
    description: desc && desc.length <= 200 ? desc : (desc ? desc.slice(0, 200) : null),
    category: cat,
    life_cycle: lc,
    hardiness_zones: hz,
    display_notes: typeof payload.display_notes === 'string' && payload.display_notes.trim() ? payload.display_notes.trim() : null,
    review_notes: typeof payload.review_notes === 'string' && payload.review_notes.trim() ? payload.review_notes.trim() : null,
  };
}

export async function invokeAugmentModel({
  client,
  modelId,
  record,
  profile,
  maxRetries = 2,
  retryDelayMs = 500,
  dryRun = false,
} = {}) {
  if (dryRun) {
    return { result: validateAugmentationSchema({}), apiCalls: 0 };
  }

  const runtime = createBedrockClient({ client, profile });
  const prompt = {
    task: 'Fill ONLY missing fields for this food crop catalog entry. Keep descriptions under 120 characters, factual, and grower-focused. Use null for any field you are not confident about. Do not guess hardiness zones.',
    record: {
      canonical_id: record.canonical_id,
      scientific_name: record.scientific_name,
      common_name: record.common_name,
      family: record.family,
      category: record.category,
      edible_parts: record.edible_parts,
      life_cycle: record.life_cycle,
      hardiness_zones: record.hardiness_zones,
    },
    fill_only: Object.entries({
      description: !record.description,
      category: !record.category,
      life_cycle: !record.life_cycle,
      hardiness_zones: !record.hardiness_zones?.length,
    }).filter(([, missing]) => missing).map(([k]) => k),
    response_schema: {
      description: 'string|null — under 120 chars, factual, no marketing language',
      category: 'string|null — one of: fruit, fruit_tree, fruit_shrub, vegetable, leafy_green, root_tuber, herb, grain, nut_seed, edible_flower, legume',
      life_cycle: 'string|null — one of: annual, biennial, perennial',
      hardiness_zones: 'string[]|[] — USDA zones as strings, e.g. ["3","4","5","6","7","8"]',
    },
  };

  let lastError;
  let apiCalls = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      apiCalls += 1;
      const response = await runtime.send(new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 512,
          messages: [{ role: 'user', content: JSON.stringify(prompt) }],
        }),
      }));
      const body = JSON.parse(Buffer.from(response.body).toString('utf8'));
      const text = body.content?.[0]?.text || '';
      const parsed = parseModelJson(text);
      return { result: validateAugmentationSchema(parsed), apiCalls };
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) await sleep(retryDelayMs * (attempt + 1));
    }
  }
  throw new Error(`Bedrock invocation failed: ${lastError?.message || 'unknown error'}`);
}

export async function batchAugment({ records, invoke = invokeAugmentModel, batchSize = 20, ...options } = {}) {
  const successes = [];
  const failures = [];
  let apiCalls = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    for (const record of batch) {
      try {
        const { result, apiCalls: count = 0 } = await invoke({ ...options, record });
        apiCalls += count;
        successes.push({ record, augmentation: result });
      } catch (error) {
        failures.push({ record, error: error.message });
      }
    }
  }

  return { successes, failures, apiCalls };
}
