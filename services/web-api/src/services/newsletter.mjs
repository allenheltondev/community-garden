const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the public contract of the newsletter service
// (POST {base}/{tenant}/subscribers). `website` is a honeypot and `elapsedMs`
// is a time-on-form signal; both are optional anti-bot fields.
export const newsletterSignupSchema = {
  type: 'object',
  required: ['email'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', minLength: 4, maxLength: 320 },
    firstName: { type: 'string', maxLength: 200 },
    lastName: { type: 'string', maxLength: 200 },
    source: { type: 'string', maxLength: 80 },
    website: { type: 'string', maxLength: 200 },
    elapsedMs: { type: 'integer', minimum: 0 }
  }
};

function sanitize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requiredEnvVar(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

/**
 * Subscribe an email address to the foundation newsletter via the upstream
 * newsletter service. The service API key is held server-side and never
 * exposed to the browser, so the public site posts here and we proxy the call.
 *
 * Returns silently (without calling upstream) when the honeypot is tripped so
 * a bot gets no signal that it was filtered.
 */
export async function subscribeToNewsletter(payload, correlationId, { fetchImpl = fetch } = {}) {
  const email = sanitize(payload?.email);
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('email must be a valid email address');
  }

  // Honeypot: real visitors never see or fill the `website` field. If it is
  // populated, treat the submission as a bot and drop it silently.
  if (sanitize(payload?.website)) {
    return { skipped: true };
  }

  const baseUrl = requiredEnvVar('NEWSLETTER_API_BASE_URL').replace(/\/+$/, '');
  const tenant = requiredEnvVar('NEWSLETTER_TENANT');
  const apiKey = requiredEnvVar('NEWSLETTER_API_KEY');

  const body = { email };
  if (sanitize(payload?.firstName)) {
    body.firstName = sanitize(payload.firstName);
  }
  if (sanitize(payload?.lastName)) {
    body.lastName = sanitize(payload.lastName);
  }
  if (Number.isInteger(payload?.elapsedMs)) {
    body.elapsedMs = payload.elapsedMs;
  }

  let response;
  try {
    response = await fetchImpl(`${baseUrl}/${encodeURIComponent(tenant)}/subscribers`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The newsletter service expects the raw key, no "Bearer " prefix.
        authorization: apiKey,
        'x-correlation-id': correlationId
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new Error(`Newsletter service request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 201 created, 200 ok, or 409 already-subscribed are all "you're on the
  // list" from the visitor's point of view.
  if (response.status === 201 || response.status === 200 || response.status === 409) {
    return { subscribed: true, alreadySubscribed: response.status === 409 };
  }

  let detail = '';
  try {
    detail = await response.text();
  } catch {
    // Keep the status-only message if the body cannot be read.
  }
  throw new Error(`Newsletter signup failed (${response.status})${detail ? `: ${detail}` : ''}`);
}
