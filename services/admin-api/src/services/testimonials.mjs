import { extractAuthContext, requireAdmin } from './auth.mjs';
import { query, withTransaction } from './db.mjs';

const MAX_TESTIMONIALS = 24;
const MAX_QUOTE_LENGTH = 600;
const MAX_ATTRIBUTION_LENGTH = 120;
const MAX_ROLE_LENGTH = 120;

function mapRow(row) {
  return {
    id: row.id,
    quote: row.quote,
    attribution: row.attribution,
    role: row.role ?? null,
    sort_order: row.sort_order,
    updated_at: row.updated_at
  };
}

export async function listTestimonials() {
  const result = await query(
    `select id::text as id, quote, attribution, role, sort_order, updated_at
       from testimonials
      order by sort_order asc, created_at asc`
  );
  return { items: result.rows.map(mapRow) };
}

function sanitize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateTestimonialsPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Request body is required');
  }

  const testimonials = payload.testimonials;
  if (!Array.isArray(testimonials)) {
    throw new Error('testimonials must be an array');
  }
  if (testimonials.length > MAX_TESTIMONIALS) {
    throw new Error(`testimonials must contain at most ${MAX_TESTIMONIALS} entries`);
  }

  return testimonials.map((testimonial, index) => {
    if (!testimonial || typeof testimonial !== 'object' || Array.isArray(testimonial)) {
      throw new Error(`testimonials[${index}] must be an object`);
    }

    const quote = sanitize(testimonial.quote);
    const attribution = sanitize(testimonial.attribution);
    const role = sanitize(testimonial.role);

    if (!quote) {
      throw new Error(`testimonials[${index}].quote is required`);
    }
    if (quote.length > MAX_QUOTE_LENGTH) {
      throw new Error(`testimonials[${index}].quote must be at most ${MAX_QUOTE_LENGTH} characters`);
    }
    if (!attribution) {
      throw new Error(`testimonials[${index}].attribution is required`);
    }
    if (attribution.length > MAX_ATTRIBUTION_LENGTH) {
      throw new Error(`testimonials[${index}].attribution must be at most ${MAX_ATTRIBUTION_LENGTH} characters`);
    }
    if (role.length > MAX_ROLE_LENGTH) {
      throw new Error(`testimonials[${index}].role must be at most ${MAX_ROLE_LENGTH} characters`);
    }

    return { quote, attribution, role: role || null };
  });
}

/**
 * Replace the full set of testimonials in one transaction. The admin UI edits
 * the whole list and saves it, so a clean replace keeps ordering and deletions
 * trivial to reason about.
 */
export async function replaceTestimonials(event, payload) {
  const auth = extractAuthContext(event);
  requireAdmin(auth);

  const testimonials = validateTestimonialsPayload(payload);

  await withTransaction(async (tx) => {
    await tx.query('delete from testimonials');
    for (let index = 0; index < testimonials.length; index += 1) {
      const testimonial = testimonials[index];
      await tx.query(
        `insert into testimonials (quote, attribution, role, sort_order)
         values ($1, $2, $3, $4)`,
        [testimonial.quote, testimonial.attribution, testimonial.role, index]
      );
    }
  });

  return listTestimonials();
}
