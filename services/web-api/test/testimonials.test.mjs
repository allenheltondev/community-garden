import { afterEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('pg', () => ({
  default: {
    Pool: class {
      query = queryMock;
    }
  }
}));

const { listPublicTestimonials } = await import('../src/services/testimonials.mjs');

describe('listPublicTestimonials', () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it('maps rows to the public shape', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    queryMock.mockResolvedValue({
      rows: [
        { id: 'a1', quote: 'Loved it', attribution: 'Seed recipient', role: 'McKinney, TX', sort_order: 0 },
        { id: 'b2', quote: 'Learned a lot', attribution: 'Volunteer', role: null, sort_order: 1 }
      ]
    });

    const result = await listPublicTestimonials();

    expect(result).toEqual({
      items: [
        { id: 'a1', quote: 'Loved it', attribution: 'Seed recipient', role: 'McKinney, TX', sortOrder: 0 },
        { id: 'b2', quote: 'Learned a lot', attribution: 'Volunteer', role: null, sortOrder: 1 }
      ]
    });
  });

  it('returns an empty list when the table does not exist yet', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    queryMock.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }));

    const result = await listPublicTestimonials();

    expect(result).toEqual({ items: [] });
  });

  it('rethrows unexpected database errors', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    queryMock.mockRejectedValue(Object.assign(new Error('connection refused'), { code: '08006' }));

    await expect(listPublicTestimonials()).rejects.toThrow('connection refused');
  });
});
