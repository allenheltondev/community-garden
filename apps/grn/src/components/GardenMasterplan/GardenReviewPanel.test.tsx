import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type GardenReviewResponse } from '../../services/api';
import { GardenReviewPanel } from './GardenReviewPanel';

const generateGardenReview = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>();
  return { ...actual, generateGardenReview };
});

const review: GardenReviewResponse = {
  modelId: 'test-model',
  modelVersion: 'tool_first_json-1',
  structuredJson: true,
  generatedAt: '2026-06-11T00:00:00Z',
  insights: [
    {
      severity: 'warning',
      category: 'companion_conflict',
      title: 'Garlic and Beans clash in North bed',
      detail: 'Alliums stunt beans and peas.',
      bedId: 'bed-1',
      bedName: 'North bed',
    },
    {
      severity: 'info',
      category: 'getting_started',
      title: 'General note',
      detail: 'No bed attached to this one.',
    },
  ],
};

describe('GardenReviewPanel', () => {
  beforeEach(() => {
    generateGardenReview.mockReset();
  });

  it('shows insights and jumps to a flagged bed', async () => {
    generateGardenReview.mockResolvedValue(review);
    const onSelectBed = vi.fn();
    render(<GardenReviewPanel onSelectBed={onSelectBed} onClose={() => {}} />);

    expect(await screen.findByText(/garlic and beans clash/i)).toBeInTheDocument();
    expect(screen.getByText(/general note/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /garlic and beans/i }));
    expect(onSelectBed).toHaveBeenCalledWith('bed-1');
  });

  it('shows the healthy state when there is nothing to flag', async () => {
    generateGardenReview.mockResolvedValue({ ...review, insights: [] });
    render(<GardenReviewPanel onSelectBed={() => {}} onClose={() => {}} />);
    expect(await screen.findByText(/your plan looks healthy/i)).toBeInTheDocument();
  });

  it('shows the upgrade nudge when the feature is pro-locked', async () => {
    generateGardenReview.mockRejectedValue(new ApiError('feature_locked', 403, 'cid'));
    render(<GardenReviewPanel onSelectBed={() => {}} onClose={() => {}} />);
    expect(
      await screen.findByText(/garden review is a/i)
    ).toBeInTheDocument();
  });

  it('shows a retryable error message on server failure', async () => {
    generateGardenReview.mockRejectedValue(new ApiError('boom', 500, 'cid'));
    render(<GardenReviewPanel onSelectBed={() => {}} onClose={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i);
  });

  it('closes via the close button', async () => {
    generateGardenReview.mockResolvedValue(review);
    const onClose = vi.fn();
    render(<GardenReviewPanel onSelectBed={() => {}} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /close garden review/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
