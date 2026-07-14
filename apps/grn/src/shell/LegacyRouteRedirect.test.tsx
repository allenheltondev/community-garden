import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LegacyRouteRedirect } from './LegacyRouteRedirect';

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

describe('LegacyRouteRedirect', () => {
  it('replaces the old route while preserving query parameters and anchors', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    render(
      <MemoryRouter initialEntries={['/crops/new?edit=crop-1#details']}>
        <Routes>
          <Route path="/crops/new" element={<LegacyRouteRedirect to="/garden/plants/new" />} />
          <Route path="*" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/garden/plants/new?edit=crop-1#details'
      );
    });
    expect(info).toHaveBeenCalledWith(
      '[navigation]',
      'Legacy route redirected',
      expect.objectContaining({
        fromRoute: '/crops/new',
        toRoute: '/garden/plants/new',
      })
    );

    info.mockRestore();
  });
});
