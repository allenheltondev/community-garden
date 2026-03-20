import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createBedrockClient({ region = process.env.AWS_REGION || 'us-east-1', client } = {}) {
  if (client) return client;
  return new BedrockRuntimeClient({ region });
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
  const out = {
    description: typeof payload.description === 'string' && payload.description.trim() ? payload.description.trim() : null,
    category: typeof payload.category === 'string' && payload.category.trim() ? payload.category.trim() : null,
    display_notes: typeof payload.display_notes === 'string' && payload.display_notes.trim() ? payload.display_notes.trim() : null,
    review_notes: typeof payload.review_notes === 'string' && payload.review_notes.trim() ? payload.review_notes.trim() : null,
  };
  return out;
}

export async function invokeAugmentModel({
  client,
  modelId,
  record,
  maxRetries = 2,
  retryDelayMs = 500,
  dryRun = false,
} = {}) {
  if (dryRun) {
    return { result: validateAugmentationSchema({}), apiCalls: 0 };
  }

  const runtime = createBedrockClient({ client });
  const prompt = {
    task: 'Provide presentation-only enrichment. Do not infer identity or overwrite source fields.',
    record: {
      canonical_id: record.canonical_id,
      scientific_name: record.scientific_name,
      common_name: record.common_name,
      family: record.family,
      category: record.category,
      review_status: record.review_status,
      catalog_status: record.catalog_status,
      source_records: record.source_records,
    },
    response_schema: {
      description: 'string|null',
      category: 'string|null',
      display_notes: 'string|null',
      review_notes: 'string|null',
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
        body: JSON.stringify(prompt),
      }));
      const body = Buffer.from(response.body).toString('utf8');
      const parsed = parseModelJson(body);
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
