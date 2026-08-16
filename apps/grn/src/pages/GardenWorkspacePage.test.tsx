import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { GardenWorkspacePage } from './GardenWorkspacePage';

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderWorkspace(initialEntry = '/garden') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/garden" element={<GardenWorkspacePage />}>
          <Route index element={<h2>Map view</h2>} />
          <Route path="plants" element={<h2>Plants view</h2>} />
          <Route path="plan" element={<h2>Plan view</h2>} />
          <Route path="journal" element={<h2>Journal view</h2>} />
          <Route path="grow-more" element={<h2>Grow more view</h2>} />
        </Route>
      </Routes>
      <LocationDisplay />
    </MemoryRouter>
  );
}

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('GardenWorkspacePage', () => {
  it('opens the illustrated map as the useful default view', () => {
    renderWorkspace();

    expect(screen.getByRole('heading', { level: 1, name: 'Garden' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Map view' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /map/i })).toHaveAttribute('aria-current', 'page');
  });

  it('switches views without dropping selected garden context', async () => {
    renderWorkspace('/garden?crop=crop-7&bed=bed-2&season=fall');

    await userEvent.click(screen.getByRole('link', { name: /plants/i }));

    expect(screen.getByRole('heading', { name: 'Plants view' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/garden/plants?crop=crop-7&bed=bed-2&season=fall'
    );
  });

  it('lets keyboard users enter each view with native links', async () => {
    renderWorkspace('/garden');
    const plantsLink = screen.getByRole('link', { name: /plants/i });

    plantsLink.focus();
    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('heading', { name: 'Plants view' })).toBeInTheDocument();
    expect(plantsLink).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the journal inside the shared garden workspace', async () => {
    renderWorkspace('/garden?season=2026');

    await userEvent.click(screen.getByRole('link', { name: /journal/i }));

    expect(screen.getByRole('heading', { name: 'Journal view' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/garden/journal?season=2026');
  });

  it('offers the grow-more library as a garden view', async () => {
    renderWorkspace('/garden');

    const link = screen.getByRole('link', { name: /grow more/i });
    expect(link).toHaveTextContent(/optional practices/i);

    await userEvent.click(link);

    expect(screen.getByRole('heading', { name: 'Grow more view' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/garden/grow-more');
  });

  it('announces offline garden behavior and clears it after reconnecting', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    renderWorkspace('/garden/plan');

    expect(screen.getByText(/you are offline/i)).toBeInTheDocument();
    fireEvent(window, new Event('online'));
    expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();
  });
});
