import { afterEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('pg', () => ({
  default: {
    Pool: class {
      query = queryMock;
    }
  }
}));

const { listPublicImpactMetrics } = await import('../src/services/impact-metrics.mjs');

describe('listPublicImpactMetrics', () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it('maps rows to the public shape', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    queryMock.mockResolvedValue({
      rows: [
        { id: 'a1', label: 'Volunteer hours', value: '2,733', caption: 'as of June 2026', sort_order: 0 },
        { id: 'b2', label: 'Pounds harvested', value: '36', caption: null, sort_order: 1 }
      ]
    });

    const result = await listPublicImpactMetrics();

    expect(result).toEqual({
      items: [
        { id: 'a1', label: 'Volunteer hours', value: '2,733', caption: 'as of June 2026', sortOrder: 0 },
        { id: 'b2', label: 'Pounds harvested', value: '36', caption: null, sortOrder: 1 }
      ]
    });
  });

  it('returns an empty list when the table does not exist yet', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    queryMock.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }));

    const result = await listPublicImpactMetrics();

    expect(result).toEqual({ items: [] });
  });

  it('rethrows unexpected database errors', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    queryMock.mockRejectedValue(Object.assign(new Error('connection refused'), { code: '08006' }));

    await expect(listPublicImpactMetrics()).rejects.toThrow('connection refused');
  });
});
