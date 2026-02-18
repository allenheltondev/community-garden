import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GrowerWizard } from './GrowerWizard';

describe('GrowerWizard', () => {
  const mockOnComplete = vi.fn();

  // Mock geolocation
  const mockGeolocation = {
    getCurrentPosition: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error - mocking geolocation
    global.navigator.geolocation = mockGeolocation;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Step 1: Location', () => {
    it('renders location step initially', () => {
      render(<GrowerWizard onComplete={mockOnComplete} />);

      expect(screen.getByText('Where are you growing?')).toBeInTheDocument();
      expect(screen.getByLabelText(/Latitude/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Longitude/i)).toBeInTheDocument();
      expect(screen.getByText('Use my current location')).toBeInTheDocument();
    });

    it('shows progress indicator at 33%', () => {
      render(<GrowerWizard onComplete={mockOnComplete} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '33.33333333333333');
    });

    it('requests geolocation on mount', async () => {
      // Clear any previous calls from other tests
      mockGeolocation.getCurrentPosition.mockClear();

      render(<GrowerWizard onComplete={mockOnComplete} />);

      // Wait for the setTimeout to execute and verify geolocation was called
      await waitFor(() => {
        expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
      });
    });

    it('populates location fields when geolocation succeeds', async () => {
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
        });
      });

      render(<GrowerWizard onComplete={mockOnComplete} />);

      await waitFor(() => {
        const latInput = screen.getByLabelText(/Latitude/i) as HTMLInputElement;
        const lngInput = screen.getByLabelText(/Longitude/i) as HTMLInputElement;

        expect(latInput.value).toBe('37.7749');
        expect(lngInput.value).toBe('-122.4194');
      });
    });

    it('allows manual entry of coordinates', () => {
      render(<GrowerWizard onComplete={mockOnComplete} />);

      const latInput = screen.getByLabelText(/Latitude/i);
      const lngInput = screen.getByLabelText(/Longitude/i);

      fireEvent.change(latInput, { target: { value: '40.7128' } });
      fireEvent.change(lngInput, { target: { value: '-74.0060' } });

      expect((latInput as HTMLInputElement).value).toBe('40.7128');
      expect((lngInput as HTMLInputElement).value).toBe('-74.006');
    });
  });
});
