import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToNewsletter } from '../src/services/newsletter.mjs';
import { handler } from '../src/handlers/api.mjs';

function createEvent(body) {
  return {
    version: '2.0',
    routeKey: 'POST /newsletter',
    rawPath: '/newsletter',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: {
        method: 'POST',
        path: '/newsletter',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest'
      },
      requestId: 'request-id'
    },
    isBase64Encoded: false,
    body: body === undefined ? undefined : JSON.stringify(body)
  };
}

describe('subscribeToNewsletter', () => {
  const baseEnv = {
    NEWSLETTER_API_BASE_URL: 'https://newsletter.example.com/',
    NEWSLETTER_TENANT: 'olivias-garden',
    NEWSLETTER_API_KEY: 'secret-key'
  };

  beforeEach(() => {
    Object.assign(process.env, baseEnv);
  });

  afterEach(() => {
    delete process.env.NEWSLETTER_API_BASE_URL;
    delete process.env.NEWSLETTER_TENANT;
    delete process.env.NEWSLETTER_API_KEY;
    vi.restoreAllMocks();
  });

  it('posts the subscriber to the upstream service with the raw API key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 201, text: async () => '' });

    const result = await subscribeToNewsletter(
      { email: 'grower@example.com', firstName: 'Pat', elapsedMs: 4200 },
      'corr-1',
      { fetchImpl }
    );

    expect(result).toEqual({ subscribed: true, alreadySubscribed: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://newsletter.example.com/olivias-garden/subscribers');
    expect(options.method).toBe('POST');
    expect(options.headers.authorization).toBe('secret-key');
    const sent = JSON.parse(options.body);
    expect(sent).toEqual({ email: 'grower@example.com', firstName: 'Pat', elapsedMs: 4200 });
  });

  it('treats an already-subscribed conflict as success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 409, text: async () => 'exists' });

    const result = await subscribeToNewsletter({ email: 'grower@example.com' }, 'corr-2', { fetchImpl });

    expect(result).toEqual({ subscribed: true, alreadySubscribed: true });
  });

  it('drops honeypot submissions without calling upstream', async () => {
    const fetchImpl = vi.fn();

    const result = await subscribeToNewsletter(
      { email: 'bot@example.com', website: 'http://spam.example' },
      'corr-3',
      { fetchImpl }
    );

    expect(result).toEqual({ skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    const fetchImpl = vi.fn();
    await expect(subscribeToNewsletter({ email: 'nope' }, 'corr-4', { fetchImpl }))
      .rejects.toThrow('email must be a valid email address');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws when the service is not configured', async () => {
    delete process.env.NEWSLETTER_API_BASE_URL;
    const fetchImpl = vi.fn();
    await expect(subscribeToNewsletter({ email: 'grower@example.com' }, 'corr-5', { fetchImpl }))
      .rejects.toThrow('NEWSLETTER_API_BASE_URL is not configured');
  });

  it('throws when the upstream returns an error status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 500, text: async () => 'boom' });
    await expect(subscribeToNewsletter({ email: 'grower@example.com' }, 'corr-6', { fetchImpl }))
      .rejects.toThrow('Newsletter signup failed (500): boom');
  });
});

describe('POST /newsletter', () => {
  beforeEach(() => {
    process.env.NEWSLETTER_API_BASE_URL = 'https://newsletter.example.com';
    process.env.NEWSLETTER_TENANT = 'olivias-garden';
    process.env.NEWSLETTER_API_KEY = 'secret-key';
  });

  afterEach(() => {
    delete process.env.NEWSLETTER_API_BASE_URL;
    delete process.env.NEWSLETTER_TENANT;
    delete process.env.NEWSLETTER_API_KEY;
    vi.restoreAllMocks();
  });

  it('returns 204 for a valid signup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 201, text: async () => '' }));

    const response = await handler(createEvent({ email: 'grower@example.com', source: 'home' }));

    expect(response.statusCode).toBe(204);
  });

  it('returns 422 for a missing email', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const response = await handler(createEvent({ source: 'home' }));

    expect(response.statusCode).toBe(422);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns 503 when the service is not configured', async () => {
    delete process.env.NEWSLETTER_API_BASE_URL;
    vi.stubGlobal('fetch', vi.fn());

    const response = await handler(createEvent({ email: 'grower@example.com' }));

    expect(response.statusCode).toBe(503);
  });
});
