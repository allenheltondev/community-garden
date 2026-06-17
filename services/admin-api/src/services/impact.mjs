import { extractAuthContext, requireAdmin } from './auth.mjs';
import { query, withTransaction } from './db.mjs';

const MAX_METRICS = 24;
const MAX_LABEL_LENGTH = 80;
const MAX_VALUE_LENGTH = 40;
const MAX_CAPTION_LENGTH = 120;

function mapRow(row) {
  return {
    id: row.id,
    label: row.label,
    value: row.value,
    caption: row.caption ?? null,
    sort_order: row.sort_order,
    updated_at: row.updated_at
  };
}

export async function listImpactMetrics() {
  const result = await query(
    `select id::text as id, label, value, caption, sort_order, updated_at
       from impact_metrics
      order by sort_order asc, created_at asc`
  );
  return { items: result.rows.map(mapRow) };
}

function sanitize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateImpactMetricsPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Request body is required');
  }

  const metrics = payload.metrics;
  if (!Array.isArray(metrics)) {
    throw new Error('metrics must be an array');
  }
  if (metrics.length > MAX_METRICS) {
    throw new Error(`metrics must contain at most ${MAX_METRICS} entries`);
  }

  return metrics.map((metric, index) => {
    if (!metric || typeof metric !== 'object' || Array.isArray(metric)) {
      throw new Error(`metrics[${index}] must be an object`);
    }

    const label = sanitize(metric.label);
    const value = sanitize(metric.value);
    const caption = sanitize(metric.caption);

    if (!label) {
      throw new Error(`metrics[${index}].label is required`);
    }
    if (label.length > MAX_LABEL_LENGTH) {
      throw new Error(`metrics[${index}].label must be at most ${MAX_LABEL_LENGTH} characters`);
    }
    if (!value) {
      throw new Error(`metrics[${index}].value is required`);
    }
    if (value.length > MAX_VALUE_LENGTH) {
      throw new Error(`metrics[${index}].value must be at most ${MAX_VALUE_LENGTH} characters`);
    }
    if (caption.length > MAX_CAPTION_LENGTH) {
      throw new Error(`metrics[${index}].caption must be at most ${MAX_CAPTION_LENGTH} characters`);
    }

    return { label, value, caption: caption || null };
  });
}

/**
 * Replace the full set of impact metrics in one transaction. The admin UI edits
 * the whole list and saves it, so a clean replace keeps ordering and deletions
 * trivial to reason about.
 */
export async function replaceImpactMetrics(event, payload) {
  const auth = extractAuthContext(event);
  requireAdmin(auth);

  const metrics = validateImpactMetricsPayload(payload);

  await withTransaction(async (tx) => {
    await tx.query('delete from impact_metrics');
    for (let index = 0; index < metrics.length; index += 1) {
      const metric = metrics[index];
      await tx.query(
        `insert into impact_metrics (label, value, caption, sort_order)
         values ($1, $2, $3, $4)`,
        [metric.label, metric.value, metric.caption, index]
      );
    }
  });

  return listImpactMetrics();
}
