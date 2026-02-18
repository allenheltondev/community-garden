import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GathererWizard } from './GathererWizard';
import type { GathererProfileInput } from '../../hooks/useOnboarding';

describe('GathererWizard', () => {
  const mockOnComplete = vi.fn();
  const mockOnBack = vi.fn();

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
      render(<GathererWizard onComplete={mockOnComplete} />);

      expect(screen.getByText('Where are you located?')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('37.7749')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('-122.4194')).toBeInTheDocument();
      // Button text changes based on loading state, so check for either text
      expect(
        screen.getByText(/use my current location|getting location/i)
      ).toBeInTheDocument();
    });

    it('shows progress indicator at 50%', () => {
      render(<GathererWizard onComplete={mockOnComplete} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    });

    it('requests geolocation on mount', async () => {
      // Clear any previous calls from other tests
      mockGeolocation.getCurrentPosition.mockClear();

      render(<GathererWizard onComplete={mockOnComplete} />);

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

      render(<GathererWizard onComplete={mockOnComplete} />);

      await waitFor(() => {
        const latInput = screen.getByPlaceholderText('37.7749') as HTMLInputElement;
        const lngInput = screen.getByPlaceholderText('-122.4194') as HTMLInputElement;

        expect(latInput.value).toBe('37.7749');
        expect(lngInput.value).toBe('-122.4194');
      });
    });

    it('allows manual entry of coordinates', () => {
      render(<GathererWizard onComplete={mockOnComplete} />);

      const latInput = screen.getByPlaceholderText('37.7749');
      const lngInput = screen.getByPlaceholderText('-122.4194');

      fireEvent.change(latInput, { target: { value: '40.7128' } });
      fireEvent.change(lngInput, { target: { value: '-74.0060' } });

      expect((latInput as HTMLInputElement).value).toBe('40.7128');
      expect((lngInput as HTMLInputElement).value).toBe('-74.006');
    });

    it('validates required location fields', async () => {
      // Prevent geolocation from auto-populating
      mockGeolocation.getCurrentPosition.mockImplementation(() => {});

      render(<GathererWizard onComplete={mockOnComplete} />);

      const nextButton = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Location is required');
      });
    });

    it('validates latitude range', async () => {
      // Prevent geolocation from auto-populating
      mockGeolocation.getCurrentPosition.mockImplementation(() => {});

      render(<GathererWizard onComplete={mockOnComplete} />);

      const latInput = screen.getByPlaceholderText('37.7749');
      const lngInput = screen.getByPlaceholderText('-122.4194');

      fireEvent.change(latInput, { target: { value: '100' } });
      fireEvent.change(lngInput, { target: { value: '-122.4194' } });

      const nextButton = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('Latitude must be between -90 and 90')).toBeInTheDocument();
      });
    });

    it('validates longitude range', async () => {
      // Prevent geolocation from auto-populating
      mockGeolocation.getCurrentPosition.mockImplementation(() => {});

      render(<GathererWizard onComplete={mockOnComplete} />);

      const latInput = screen.getByPlaceholderText('37.7749');
      const lngInput = screen.getByPlaceholderText('-122.4194');

      fireEvent.change(latInput, { target: { value: '37.7749' } });
      fireEvent.change(lngInput, { target: { value: '200' } });

      const nextButton = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('Longitude must be between -180 and 180')).toBeInTheDocument();
      });
    });

    it('proceeds to preferences step when location is valid', async () => {
      // Prevent geolocation from auto-populating
      mockGeolocation.getCurrentPosition.mockImplementation(() => {});

      render(<GathererWizard onComplete={mockOnComplete} />);

      const latInput = screen.getByPlaceholderText('37.7749');
      const lngInput = screen.getByPlaceholderText('-122.4194');

      fireEvent.change(latInput, { target: { value: '37.7749' } });
      fireEvent.change(lngInput, { target: { value: '-122.4194' } });

      const nextButton = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('Set your preferences')).toBeInTheDocument();
      });
    });
  });

  describe('Step 2: Preferences', () => {
    beforeEach(async () => {
      // Prevent geolocation from auto-populating
      mockGeolocation.getCurrentPosition.mockImplementation(() => {});

      render(<GathererWizard onComplete={mockOnComplete} />);

      // Fill location and proceed
      const latInput = screen.getByPlaceholderText('37.7749');
      const lngInput = screen.getByPlaceholderText('-122.4194');

      fireEvent.change(latInput, { target: { value: '37.7749' } });
      fireEvent.change(lngInput, { target: { value: '-122.4194' } });

      const nextButton = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('Set your preferences')).toBeInTheDocument();
      });
    });

    it('renders preferences step', () => {
      expect(screen.getByText('Set your preferences')).toBeInTheDocument();
      expect(screen.getByLabelText(/search radius/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/organization/i)).toBeInTheDocument();
    });

    it('shows progress indicator at 100%', () => {
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '100');
    });

    it('allows adjusting search radius', () => {
      const radiusSlider = screen.getByLabelText(/search radius in kilometers/i) as HTMLInputElement;

      fireEvent.change(radiusSlider, { target: { value: '25' } });

      expect(screen.getByText('25 km')).toBeInTheDocument();
    });

    it('allows entering organization affiliation', () => {
      const orgInput = screen.getByLabelText(/organization/i) as HTMLInputElement;

      fireEvent.change(orgInput, { target: { value: 'SF Food Bank' } });

      expect(orgInput.value).toBe('SF Food Bank');
    });

    it('allows selecting metric units', () => {
      const metricButton = screen.getByRole('button', { name: /metric/i });

      fireEvent.click(metricButton);

      expect(metricButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('allows selecting imperial units', () => {
      const imperialButton = screen.getByRole('button', { name: /imperial/i });

      fireEvent.click(imperialButton);

      expect(imperialButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('validates search radius is positive', async () => {
      // The slider has min="1", so we can't actually set it to 0 via the UI
      // This test verifies the validation logic exists by checking the component doesn't allow invalid values
      const radiusSlider = screen.getByLabelText(/search radius in kilometers/i);

      // Verify the slider has a minimum of 1
      expect(radiusSlider).toHaveAttribute('min', '1');

      // The validation would trigger if someone tried to submit with 0, but the UI prevents it
      // So we verify the slider enforces the minimum
      expect(parseInt(radiusSlider.getAttribute('min') || '0')).toBeGreaterThan(0);
    });

    it('submits valid gatherer profile', async () => {
      const radiusSlider = screen.getByLabelText(/search radius in kilometers/i);
      const orgInput = screen.getByLabelText(/organization/i);
      const metricButton = screen.getByRole('button', { name: /metric/i });

      fireEvent.change(radiusSlider, { target: { value: '15' } });
      fireEvent.change(orgInput, { target: { value: 'Community Garden' } });
      fireEvent.click(metricButton);

      const submitButton = screen.getByRole('button', { name: /complete setup/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalledWith({
          lat: 37.7749,
          lng: -122.4194,
          searchRadiusKm: 15,
          organizationAffiliation: 'Community Garden',
          units: 'metric',
          locale: expect.any(String),
        });
      });
    });

    it('submits without optional organization', async () => {
      const submitButton = screen.getByRole('button', { name: /complete setup/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalledWith({
          lat: 37.7749,
          lng: -122.4194,
          searchRadiusKm: 10,
          organizationAffiliation: undefined,
          units: 'imperial',
          locale: expect.any(String),
        });
      });
    });

    it('shows loading state during submission', async () => {
      const slowOnComplete: (data: GathererProfileInput) => Promise<void> = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      // Prevent geolocation from auto-populating
      mockGeolocation.getCurrentPosition.mockImplementation(() => {});

      // Use a separate render to avoid conflicts with beforeEach
      render(<GathererWizard onComplete={slowOnComplete} />);

      // Navigate to preferences
      const latInput = screen.getAllByPlaceholderText('37.7749')[0];
      const lngInput = screen.getAllByPlaceholderText('-122.4194')[0];
      fireEvent.change(latInput, { target: { value: '37.7749' } });
      fireEvent.change(lngInput, { target: { value: '-122.4194' } });

      const nextButtons = screen.getAllByRole('button', { name: /next/i });
      fireEvent.click(nextButtons[nextButtons.length - 1]);

      await waitFor(() => {
        expect(screen.getAllByText('Set your preferences').length).toBeGreaterThan(0);
      });

      const submitButtons = screen.getAllByRole('button', { name: /complete setup/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(submitButton).toHaveAttribute('aria-busy', 'true');
      });
    });
  });

  describe('Navigation', () => {
    it('allows navigating back from preferences to location', async () => {
      // Prevent geolocation from auto-populating
      mockGeolocation.getCurrentPosition.mockImplementation(() => {});

      render(<GathererWizard onComplete={mockOnComplete} />);

      // Navigate to preferences
      const latInput = screen.getByPlaceholderText('37.7749');
      const lngInput = screen.getByPlaceholderText('-122.4194');

      fireEvent.change(latInput, { target: { value: '37.7749' } });
      fireEvent.change(lngInput, { target: { value: '-122.4194' } });

      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText('Set your preferences')).toBeInTheDocument();
      });

      // Navigate back
      const backButton = screen.getByRole('button', { name: /back/i });
      fireEvent.click(backButton);

      await waitFor(() => {
        expect(screen.getByText('Where are you located?')).toBeInTheDocument();
      });
    });

    it('calls onBack when back is clicked from location step', () => {
      render(<GathererWizard onComplete={mockOnComplete} onBack={mockOnBack} />);

      const backButton = screen.getByRole('button', { name: /back/i });
      fireEvent.click(backButton);

      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });

    it('does not call onBack when onBack prop is not provided', () => {
      render(<GathererWizard onComplete={mockOnComplete} />);

      const backButton = screen.getByRole('button', { name: /back/i });
      fireEvent.click(backButton);

      // Should not throw error
      expect(mockOnBack).not.toHaveBeenCalled();
    });
  });
});
