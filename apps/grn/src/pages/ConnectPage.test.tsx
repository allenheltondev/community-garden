import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ConnectPage } from './ConnectPage';

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ConnectPage />
      <LocationDisplay />
    </MemoryRouter>
  );
}

describe('ConnectPage', () => {
  it('renders the four connect options', () => {
    renderPage();
    expect(screen.getByText('Share your surplus')).toBeInTheDocument();
    expect(screen.getByText('Find food nearby')).toBeInTheDocument();
    expect(screen.getByText('What neighbors need')).toBeInTheDocument();
    expect(screen.getByText('Share your garden')).toBeInTheDocument();
  });

  it('navigates to the listings flow from the share card', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /post a listing/i }));
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/listings');
    });
  });

  it('navigates to find-food from the discover card', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /discover food/i }));
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/requests');
    });
  });
});
